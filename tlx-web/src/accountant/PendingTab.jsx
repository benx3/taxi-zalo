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

const fmtTime = (ms) => {
  const d = new Date(Number(ms));
  if (!ms || isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};
const fmtPts = (p) => {
  const n = Number(p) || 0;
  return (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)) + "đ";
};

export default function PendingTab({ groupId, liveItems, onProcessed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(new Set());
  const [warnData, setWarnData] = useState(null); // { id, overridePts, fromName, fromPoints }
  const [editPts, setEditPts] = useState({});     // id → string giá trị đang nhập
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

  const doApprove = async (id, overridePts) => {
    setWarnData(null);
    setProcessing(prev => new Set(prev).add(id));
    try {
      await api.approveTransfer(id, overridePts != null ? overridePts : undefined);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setEditPts(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e) {
      alert(e.message);
    } finally {
      setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const handle = async (id, action, fromPoints, overridePts, fromName) => {
    if (action === "approve") {
      if (fromPoints != null && overridePts > 0 && (fromPoints - overridePts) < 0) {
        setWarnData({ id, overridePts, fromName, fromPoints }); return;
      }
      return doApprove(id, overridePts);
    }
    setProcessing(prev => new Set(prev).add(id));
    try {
      await api.rejectTransfer(id);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
      setEditPts(prev => { const n = { ...prev }; delete n[id]; return n; });
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

          const isBarem = item.type === "barem";
          let convo = null;
          if (isBarem && item.raw_text) {
            try { convo = JSON.parse(item.raw_text); } catch {}
          }

          // Điểm có thể chỉnh sửa trực tiếp: lấy từ editPts nếu đang sửa, nếu không thì pts gốc
          const ptsStr = editPts[id] !== undefined ? editPts[id] : (pts > 0 ? String(pts) : "");
          const overridePts = ptsStr.trim() !== "" ? Number(ptsStr) : 0;
          const isEdited = overridePts !== pts;

          return (
            <div key={id} style={{ background: "var(--card)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>

              {/* Tiêu đề: badge + thời gian */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: isBarem ? "rgba(96,165,250,.15)" : "rgba(245,158,11,.15)", color: isBarem ? "#60a5fa" : "#f59e0b", fontWeight: 700 }}>
                  {isBarem ? "Barem" : "San điểm"}
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={10} /> {fmtTime(createdAt)}
                </span>
              </div>

              {/* Nội dung chat gốc */}
              {convo?.text && convo?.sender && !convo?.tripText ? (
                <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{convo.time || ""}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                      <b style={{ color: "var(--ink)", marginRight: 3 }}>{convo.sender}:</b>{convo.text}
                    </span>
                  </div>
                </div>
              ) : convo ? (
                <>
                  {convo.multiTrips && (
                    <div style={{ background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 8, padding: "8px 11px", marginBottom: 8, fontSize: 12 }}>
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>⚠️ Tin có {convo.multiTrips.length} cuốc — kiểm tra và điều chỉnh điểm trước khi duyệt</span>
                      <div style={{ marginTop: 5, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {convo.multiTrips.map((t, i) => (
                          <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,.07)", color: "var(--ink)" }}>
                            {t.type} · {t.price}k
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
                    {[
                      convo.tripPoster    && { time: convo.tripTime,    name: convo.tripPoster,    text: convo.tripText,    color: null },
                      convo.claimer       && { time: convo.claimTime,   name: convo.claimer,       text: convo.claimText,   color: "#60a5fa" },
                      convo.confirmPoster && { time: convo.confirmTime, name: convo.confirmPoster, text: convo.confirmText, color: "#34d399" },
                      convo.freePoster    && { time: convo.freeTime,    name: convo.freePoster,    text: convo.freeText,    color: "#fb923c" },
                    ].filter(Boolean).map((row, i) => (
                      <div key={i} style={{ display: "flex", gap: 5, marginBottom: 2 }}>
                        <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{row.time || ""}</span>
                        <span style={{ fontSize: 11, color: row.color || "var(--ink-dim)" }}>
                          <b style={{ color: "var(--ink)", marginRight: 3 }}>{row.name}:</b>{row.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : chatText ? (
                <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 11px", marginBottom: 12, fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.55, wordBreak: "break-word" }}>
                  {chatText}
                </div>
              ) : null}

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
                      <b style={{ color: (fromPoints - overridePts) >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(fromPoints - overridePts)}</b>
                    </div>
                  )}
                </div>

                {/* Số điểm + mũi tên — có thể chỉnh sửa trực tiếp */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                    <input
                      type="number"
                      value={ptsStr}
                      onChange={e => setEditPts(prev => ({ ...prev, [id]: e.target.value }))}
                      placeholder="0"
                      style={{
                        width: 58, textAlign: "center", fontWeight: 900, fontSize: 18,
                        color: isEdited ? "#fb923c" : "#f59e0b",
                        background: "transparent", border: "none",
                        borderBottom: `1.5px solid ${isEdited ? "rgba(251,146,60,.6)" : "rgba(245,158,11,.35)"}`,
                        outline: "none", padding: "0 2px", MozAppearance: "textfield",
                      }}
                    />
                    <span style={{ fontWeight: 700, fontSize: 13, color: isEdited ? "#fb923c" : "#f59e0b" }}>đ</span>
                  </div>
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
                      <b style={{ color: (toPoints + overridePts) >= 0 ? "#34d399" : "#f87171" }}>{fmtPts(toPoints + overridePts)}</b>
                    </div>
                  )}
                </div>
              </div>

              {/* Nút duyệt / từ chối */}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handle(id, "reject", fromPoints, overridePts, fromName)} disabled={busy}
                  style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", fontWeight: 700, fontSize: 13, background: "rgba(248,113,113,.12)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: busy ? .5 : 1 }}>
                  <XCircle size={14} /> Từ chối
                </button>
                <button onClick={() => handle(id, "approve", fromPoints, overridePts, fromName)} disabled={busy}
                  style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", fontWeight: 800, fontSize: 13, background: isEdited ? "rgba(251,146,60,.18)" : "rgba(52,211,153,.15)", color: isEdited ? "#fb923c" : "#34d399", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, opacity: busy ? .5 : 1 }}>
                  <CheckCircle2 size={14} /> {isEdited ? `Duyệt ${overridePts}đ` : isBarem ? "Duyệt điểm barem" : "Duyệt san điểm"}
                </button>
              </div>

              {/* Cảnh báo điểm âm */}
              {warnData?.id === id && (
                <div style={{ marginTop: 8, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.4)", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, color: "#f59e0b", marginBottom: 6 }}>
                    ⚠️ Cảnh báo: điểm người chuyển sẽ âm
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 10 }}>
                    Sau giao dịch, <b style={{ color: "var(--ink)" }}>{warnData.fromName}</b> sẽ có <b style={{ color: "#f87171" }}>{fmtPts(warnData.fromPoints - warnData.overridePts)}</b>. Vẫn tiếp tục?
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setWarnData(null)}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                      Huỷ
                    </button>
                    <button onClick={() => doApprove(warnData.id, warnData.overridePts)} disabled={busy}
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
