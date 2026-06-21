import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { Edit2, Trash2, X, Clock, AlertTriangle } from "lucide-react";

const fmtTime = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function TransactionsTab({ groupId }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const reload = () => {
    if (!groupId) return;
    setLoading(true);
    api.listTransactions(groupId, null, 200).then(setTxs).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [groupId]);

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Giao dịch gần đây</span>
        <button onClick={reload} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 12 }}>↻ Tải lại</button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Đang tải…</div>}
      {!loading && txs.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 32, fontSize: 14 }}>Chưa có giao dịch nào</div>
      )}

      <div style={{ padding: "0 16px" }}>
        {txs.map(tx => (
          <TxRow key={tx.id} tx={tx}
            onEdit={() => setEditing(tx)}
            onDelete={() => setDeleting(tx)} />
        ))}
      </div>

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
  let c = null;
  try { c = typeof raw === "string" ? JSON.parse(raw) : null; } catch {}
  if (c?.tripText) {
    const row = (time, name, msg, color) => (
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{time}</span>
        <span style={{ fontSize: 11, color: color || "var(--ink-dim)" }}>
          <b style={{ color: "var(--ink)", marginRight: 4 }}>{name}:</b>{msg}
        </span>
      </div>
    );
    return (
      <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, lineHeight: 1.4 }}>
        {row(c.tripTime, c.tripPoster, c.tripText, null)}
        {c.claimText && row(c.claimTime, c.claimer, c.claimText, "#60a5fa")}
        {c.confirmText && row(c.confirmTime, c.confirmPoster, c.confirmText, "#34d399")}
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

function TxRow({ tx, onEdit, onDelete }) {
  const pts = Number(tx.points);
  const ptsStr = pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2);
  const receiver = tx.to_member_name || tx.to_member;
  const sender   = tx.from_member_name || tx.from_member;
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
        <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 14, color: pts >= 0 ? "#34d399" : "#f87171" }}>
          {pts >= 0 ? "+" : ""}{ptsStr} đ
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

      {!isPending && (
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
    if (isNaN(p) || p <= 0) { setErr("Số điểm phải > 0"); return; }
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
        <input type="number" step="0.5" min="0.5" value={points} onChange={e => setPoints(e.target.value)}
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
          Giao dịch <b>"{tx.reason || "này"}"</b> ({tx.points.toFixed(tx.points % 1 === 0 ? 0 : 1)}đ) sẽ bị xóa và điểm sẽ được hoàn lại tự động.
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
