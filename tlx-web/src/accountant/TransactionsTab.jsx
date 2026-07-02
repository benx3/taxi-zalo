import React, { useState, useEffect, useMemo } from "react";
import { api } from "./api.js";
import { Edit2, Trash2, X, Clock, AlertTriangle, Search, Check, Ban } from "lucide-react";

const PAGE_SIZE = 20;

const fmtTime = (ms) => {
  const d = new Date(Number(ms));
  if (!ms || isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

function buildPageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

export default function TransactionsTab({ groupId }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const reload = (from, to) => {
    if (!groupId) return;
    setLoading(true);
    const fromTs = from ? new Date(from).getTime() : undefined;
    const toTs   = to   ? new Date(to).getTime()   : undefined;
    api.listTransactions(groupId, null, fromTs || toTs ? 2000 : 500, fromTs, toTs)
      .then(data => { setTxs(data); setPage(1); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [groupId]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return txs;
    return txs.filter(tx => {
      const receiver = (tx.to_member_name || tx.to_member || "").toLowerCase();
      const sender   = (tx.from_member_name || tx.from_member || "").toLowerCase();
      return receiver.includes(s) || sender.includes(s);
    });
  }, [txs, q]);

  const totalPages = Math.ceil(Math.max(filtered.length, 1) / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
          Giao dịch{q.trim() ? ` — ${filtered.length}/${txs.length}` : ` — ${txs.length} bản ghi`}
          {(dateFrom || dateTo) && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, marginLeft: 6 }}>● đang lọc ngày</span>}
        </span>
        <button onClick={() => reload(dateFrom, dateTo)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 12 }}>↻ Tải lại</button>
      </div>
      {/* Tìm theo tên */}
      <div style={{ padding: "0 16px 8px", position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 26, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)", pointerEvents: "none" }} />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          placeholder="Tìm theo tên người nhận hoặc người bị trừ…"
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px 8px 34px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
        />
        {q && (
          <button onClick={() => { setQ(""); setPage(1); }} style={{ position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 16, lineHeight: 1 }}>×</button>
        )}
      </div>
      {/* Lọc theo khoảng thời gian */}
      <div style={{ padding: "0 16px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--ink-dim)", whiteSpace: "nowrap" }}>Từ</span>
        <input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 12, outline: "none", colorScheme: "dark" }} />
        <span style={{ fontSize: 12, color: "var(--ink-dim)", whiteSpace: "nowrap" }}>đến</span>
        <input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 12, outline: "none", colorScheme: "dark" }} />
        <button onClick={() => reload(dateFrom, dateTo)}
          style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.2)", color: "#34d399", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
          Lọc
        </button>
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); reload(); }}
            style={{ padding: "7px 10px", borderRadius: 9, border: "none", background: "rgba(248,113,113,.1)", color: "#f87171", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Xóa lọc
          </button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Đang tải…</div>}
      {!loading && txs.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 32, fontSize: 14 }}>Chưa có giao dịch nào</div>
      )}

      <div style={{ padding: "0 16px" }}>
        {paged.map(tx => (
          <TxRow key={tx.id} tx={tx}
            onEdit={() => setEditing(tx)}
            onDelete={() => setDeleting(tx)}
            onApprove={async () => { await api.approveTransfer(tx.id); reload(); }}
            onReject={async () => { await api.rejectTransfer(tx.id); reload(); }} />
        ))}
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
          <span style={{ fontSize: 11, color: "var(--ink-dim)", marginLeft: 6 }}>{filtered.length} giao dịch</span>
        </div>
      )}

      {editing && (
        <EditTxModal tx={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />
      )}
      {deleting && (
        <ConfirmDeleteModal tx={deleting} onClose={() => setDeleting(null)} onDone={() => { setDeleting(null); reload(); }} />
      )}
    </div>
  );
}

const STATUS_CFG = {
  approved: { label: "Đã duyệt", color: "#34d399", bg: "rgba(52,211,153,.12)" },
  pending:  { label: "Chờ duyệt", color: "#f59e0b", bg: "rgba(245,158,11,.12)" },
  rejected: { label: "Từ chối",   color: "#f87171", bg: "rgba(248,113,113,.12)" },
};

function ConvoThread({ raw }) {
  const [showLog, setShowLog] = useState(false);
  let c = null;
  try { c = typeof raw === "string" ? JSON.parse(raw) : null; } catch {}

  const fmtTs = (ts) => ts ? new Date(Number(ts)).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit",
  }) : "";

  if (c?.tripText) {
    const row = (time, name, msg, color) => (
      <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{time}</span>
        <span style={{ fontSize: 11, color: color || "var(--ink-dim)" }}>
          <b style={{ color: "var(--ink)", marginRight: 4 }}>{name}:</b>{msg}
        </span>
      </div>
    );
    const logItems = Array.isArray(c.rawLog) ? c.rawLog : [];
    return (
      <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, lineHeight: 1.4 }}>
        {row(c.tripTime, c.tripPoster, c.tripText, null)}
        {c.claimText   && row(c.claimTime,   c.claimer,       c.claimText,   "#60a5fa")}
        {c.confirmText && row(c.confirmTime,  c.confirmPoster, c.confirmText, "#34d399")}
        {(c.adjustHistory || []).map((h, i) =>
          h?.cancelText ? <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{h.cancelTime}</span>
            <span style={{ fontSize: 11, color: "#fbbf24" }}><b style={{ color: "var(--ink)", marginRight: 4 }}>{h.canceller}:</b>{h.cancelText}</span>
          </div> : null
        )}
        {c.cancelText  && row(c.cancelTime,   c.canceller,     c.cancelText,  "#fbbf24")}
        {c.freeText    && row(c.freeTime,     c.freePoster,    c.freeText,    "#fb923c")}
        {logItems.length > 0 && (
          <div style={{ marginTop: 6, borderTop: "1px solid var(--line)", paddingTop: 5 }}>
            <button onClick={() => setShowLog(v => !v)}
              style={{ fontSize: 10, color: "var(--ink-dim)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showLog ? "▲ Ẩn chat log" : `▼ Chat log (${logItems.length} tin)`}
            </button>
            {showLog && (
              <div style={{ marginTop: 4, maxHeight: 220, overflowY: "auto", paddingRight: 4 }}>
                {logItems.map((m, i) => row(fmtTs(m.ts), m.name, m.text, null))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if (raw) {
    return (
      <div style={{ background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", marginBottom: 6, fontSize: 12, color: "var(--ink-dim)", wordBreak: "break-word" }}>
        {raw.length > 120 ? raw.slice(0, 120) + "…" : raw}
      </div>
    );
  }
  return null;
}

function TxRow({ tx, onEdit, onDelete, onApprove, onReject }) {
  const abspts = Math.abs(Number(tx.points));
  const receiver = tx.to_member_name || tx.to_member;
  const sender   = tx.from_member_name || tx.from_member;
  // Nếu chỉ có from_member (không có to_member) → đây là giao dịch trừ điểm
  const isDeduction = !!tx.from_member && !tx.to_member;
  const effectivePts = isDeduction ? -abspts : abspts;
  const ptsStr = abspts % 1 === 0 ? abspts.toFixed(0) : abspts.toFixed(2);
  const ptsColor = effectivePts >= 0 ? "#34d399" : "#f87171";
  const ptsSign  = effectivePts >= 0 ? "+" : "-";
  const status   = tx.status || "approved";
  const sCfg     = STATUS_CFG[status] || STATUS_CFG.approved;
  const isPending = status === "pending";

  return (
    <div style={{ background: "var(--card)", border: `1px solid ${isPending ? "rgba(245,158,11,.3)" : "var(--line)"}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8, opacity: status === "rejected" ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        {receiver
          ? <span style={{ fontWeight: 700, fontSize: 13, color: "#34d399" }}>{receiver} nhận</span>
          : sender
            ? <span style={{ fontWeight: 700, fontSize: 13 }}>{sender}</span>
            : <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-dim)" }}>Điều chỉnh</span>
        }
        {sender && receiver && <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>← {sender}</span>}
        <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 14, color: ptsColor }}>
          {ptsSign}{ptsStr} đ
        </span>
      </div>

      {tx.raw_text && <ConvoThread raw={tx.raw_text} />}

      {tx.reason && !tx.raw_text && (
        <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.45, marginBottom: 6, wordBreak: "break-word" }}>
          {tx.reason.length > 100 ? tx.reason.slice(0, 100) + "…" : tx.reason}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: sCfg.bg, color: sCfg.color, fontWeight: 700 }}>
          {sCfg.label}
        </span>
        <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 6, background: "rgba(255,255,255,.05)", color: "var(--ink-dim)", fontWeight: 600 }}>
          {tx.type === "barem" ? "barem" : tx.type === "san" ? "san điểm" : tx.type === "auto" ? "tự động" : "thủ công"}
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
          <Clock size={10} /> {fmtTime(tx.created_at)}
        </span>
      </div>

      {isPending ? (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={onApprove} style={{ background: "rgba(52,211,153,.15)", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer", color: "#34d399", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
            <Check size={12} /> Duyệt
          </button>
          <button onClick={onReject} style={{ background: "rgba(248,113,113,.1)", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
            <Ban size={12} /> Từ chối
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button onClick={onEdit} style={{ background: "rgba(96,165,250,.1)", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#60a5fa", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
            <Edit2 size={12} /> Sửa
          </button>
          <button onClick={onDelete} style={{ background: "rgba(248,113,113,.1)", border: "none", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
            <Trash2 size={12} /> Hủy
          </button>
        </div>
      )}
    </div>
  );
}

function EditTxModal({ tx, onClose, onDone }) {
  const [reason, setReason] = useState(tx.reason || "");
  const [points, setPoints] = useState(String(tx.points));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const p = parseFloat(points);
    if (isNaN(p)) { setErr("Nhập số điểm hợp lệ"); return; }
    setSaving(true); setErr("");
    try {
      await api.updateTransaction(tx.id, { reason, points: p });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "var(--card)", borderRadius: 18, padding: 20, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Edit2 size={17} color="#60a5fa" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Sửa giao dịch</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>Số điểm</label>
        <input type="number" step="0.5" value={points} onChange={e => setPoints(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none", marginBottom: 12 }} />
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>Lý do</label>
        <input value={reason} onChange={e => setReason(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
          onKeyDown={e => e.key === "Enter" && submit()} />
        {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</div>}
        <button onClick={submit} disabled={saving} style={{ width: "100%", marginTop: 16, padding: "11px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "rgba(96,165,250,.15)", color: "#60a5fa" }}>
          {saving ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ tx, onClose, onDone }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setSaving(true); setErr("");
    try { await api.deleteTransaction(tx.id); onDone(); }
    catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 340, background: "var(--card)", borderRadius: 18, padding: 20, border: "1px solid #f8717144" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={17} color="#f87171" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Hủy giao dịch?</span>
        </div>
        <p style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.6, margin: "0 0 8px" }}>
          Giao dịch <b>"{tx.reason || "này"}"</b> ({parseFloat(tx.points.toFixed(2))}đ) sẽ bị xóa và điểm sẽ được hoàn lại tự động.
        </p>
        {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Bỏ qua</button>
          <button onClick={submit} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "none", background: "rgba(248,113,113,.15)", color: "#f87171", fontWeight: 800, fontSize: 13, cursor: saving ? "default" : "pointer" }}>
            {saving ? "Đang hủy…" : "Xác nhận hủy"}
          </button>
        </div>
      </div>
    </div>
  );
}
