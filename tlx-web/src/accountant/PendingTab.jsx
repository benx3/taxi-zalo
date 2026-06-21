import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { CheckCircle2, XCircle, Clock, RefreshCw, ArrowRight } from "lucide-react";

const PAGE_SIZE = 10;

function buildPageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

const fmtTime = (ms) => new Date(ms).toLocaleString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit", month: "2-digit", year: "numeric",
  hour: "2-digit", minute: "2-digit",
});
const fmtPts = (p) => {
  const n = Number(p) || 0;
  return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)) + "đ";
};

export default function PendingTab({ groupId, liveItems, onProcessed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(new Set());
  const [warnId, setWarnId] = useState(null);
  const [page, setPage] = useState(1);

  const reload = () => {
    if (!groupId) return;
    setLoading(true);
    api.pendingTransfers(groupId).then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [groupId]);

  // Merge live WS events với items từ DB
  const allItems = [
    ...liveItems.filter(l => l.groupId === groupId && !items.some(i => i.id === l.txId)),
    ...items,
  ];
  const totalPages = Math.ceil(Math.max(allItems.length, 1) / PAGE_SIZE);
  const paged = allItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const doApprove = async (id) => {
    setWarnId(null);
    setProcessing(prev => new Set(prev).add(id));
    try {
      await api.approveTransfer(id);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handle = async (id, action, fromPoints, pts) => {
    if (action === "approve") {
      if (fromPoints != null && (fromPoints - pts) < 0) {
        setWarnId(id); return;
      }
      return doApprove(id);
    }
    setProcessing(prev => new Set(prev).add(id));
    try {
      await api.rejectTransfer(id);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={15} color="#f59e0b" />
          Chờ duyệt {allItems.length > 0 && <span style={{ fontSize: 12, background: "rgba(245,158,11,.2)", color: "#f59e0b", borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{allItems.length}</span>}
        </span>
        <button onClick={reload} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <RefreshCw size={13} /> Tải lại
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Đang tải…</div>}
      {!loading && allItems.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 48 }}>
          <CheckCircle2 size={36} style={{ opacity: .3, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Không có yêu cầu san điểm nào chờ duyệt</div>
        </div>
      )}

      <div style={{ padding: "0 16px" }}>
        {paged.map(item => {
          const id = item.id || item.txId;
          const busy = processing.has(id);

          // Tên + điểm hiện tại — ưu tiên DB data, fallback WS live data
          const fromName   = item.from_member_name || item.fromName || item.fromUid || item.from_member || "?";
          const toName     = item.to_member_name   || item.toName   || item.toUid   || item.to_member   || "?";
          const fromPoints = item.from_points != null ? Number(item.from_points) : null;
          const toPoints   = item.to_points   != null ? Number(item.to_points)   : null;
          const pts        = Number(item.points);
          const chatText   = item.reason || item.rawText || "";
          const createdAt  = item.created_at || Date.now();

          return (
            <div key={id} style={{ background: "var(--card)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>

              {/* Tiêu đề: badge + thời gian */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,.15)", color: "#f59e0b", fontWeight: 700 }}>
                  San điểm
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={10} /> {fmtTime(createdAt)}
                </span>
              </div>

              {/* Nội dung chat gốc */}
              {chatText && (
                <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", marginBottom: 12, fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.55, wordBreak: "break-word" }}>
                  {chatText}
                </div>
              )}

              {/* Người chuyển → Người nhận */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {/* Người bị trừ điểm */}
                <div style={{ background: "rgba(248,113,113,.08)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#f87171", fontWeight: 700, marginBottom: 3 }}>Người chuyển</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fromName}</div>
                  {fromPoints != null && (
                    <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                      Hiện: <b style={{ color: fromPoints >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(fromPoints)}</b>
                      {" → "}
                      <b style={{ color: (fromPoints - pts) >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(fromPoints - pts)}</b>
                    </div>
                  )}
                </div>

                {/* Số điểm + mũi tên */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 900, fontSize: 18, color: "#f59e0b" }}>{fmtPts(pts)}</span>
                  <ArrowRight size={18} color="#f59e0b" />
                </div>

                {/* Người nhận điểm */}
                <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "#34d399", fontWeight: 700, marginBottom: 3 }}>Người nhận</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toName}</div>
                  {toPoints != null && (
                    <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                      Hiện: <b style={{ color: toPoints >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(toPoints)}</b>
                      {" → "}
                      <b style={{ color: (toPoints + pts) >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(toPoints + pts)}</b>
                    </div>
                  )}
                </div>
              </div>

              {/* Nút duyệt / từ chối */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handle(id, "reject", fromPoints, pts)} disabled={busy}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", fontWeight: 700, fontSize: 13, background: "rgba(248,113,113,.12)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: busy ? .5 : 1 }}>
                  <XCircle size={14} /> Từ chối
                </button>
                <button onClick={() => handle(id, "approve", fromPoints, pts)} disabled={busy}
                  style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", fontWeight: 800, fontSize: 13, background: "rgba(52,211,153,.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: busy ? .5 : 1 }}>
                  <CheckCircle2 size={14} /> Duyệt san điểm
                </button>
              </div>

              {/* Cảnh báo điểm âm */}
              {warnId === id && (
                <div style={{ marginTop: 8, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.4)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "#f59e0b", marginBottom: 6 }}>
                    ⚠️ Cảnh báo: điểm người chuyển sẽ âm
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 10 }}>
                    Sau giao dịch, <b style={{ color: "var(--ink)" }}>{fromName}</b> sẽ có <b style={{ color: "#f87171" }}>{fmtPts(fromPoints - pts)}</b>. Vẫn tiếp tục?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setWarnId(null)}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                      Huỷ
                    </button>
                    <button onClick={() => doApprove(id)} disabled={busy}
                      style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "rgba(245,158,11,.25)", color: "#f59e0b", fontSize: 13, cursor: busy ? "default" : "pointer", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <CheckCircle2 size={13} /> Vẫn duyệt
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "16px 16px 0", flexWrap: "wrap" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: page === 1 ? "var(--ink-dim)" : "var(--ink)", cursor: page === 1 ? "default" : "pointer", fontSize: 13 }}>‹</button>
          {buildPageList(page, totalPages).map((p, idx) =>
            p === "…"
              ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>…</span>
              : <button key={p} onClick={() => setPage(p)}
                  style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid", borderColor: p === page ? "var(--accent)" : "var(--line)", background: p === page ? "rgba(52,211,153,.15)" : "transparent", color: p === page ? "var(--accent)" : "var(--ink)", fontWeight: p === page ? 800 : 400, fontSize: 13, cursor: "pointer" }}>
                  {p}
                </button>
          )}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: page === totalPages ? "var(--ink-dim)" : "var(--ink)", cursor: page === totalPages ? "default" : "pointer", fontSize: 13 }}>›</button>
          <span style={{ fontSize: 11, color: "var(--ink-dim)", marginLeft: 6 }}>{allItems.length} yêu cầu</span>
        </div>
      )}
    </div>
  );
}
