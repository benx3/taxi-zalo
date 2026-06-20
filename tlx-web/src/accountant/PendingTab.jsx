import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";

const fmtTime = (ms) => new Date(ms).toLocaleString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit",
  hour: "2-digit", minute: "2-digit",
});
const fmtPts = (p) => (p % 1 === 0 ? p.toFixed(0) : p.toFixed(2));

export default function PendingTab({ groupId, liveItems, onProcessed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const handleApprove = async (id) => {
    try {
      await api.approveTransfer(id);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { alert(e.message); }
  };

  const handleReject = async (id) => {
    try {
      await api.rejectTransfer(id);
      onProcessed(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: "0 0 80px" }}>
      <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={15} color="#f59e0b" /> Chờ duyệt
        </span>
        <button onClick={reload} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <RefreshCw size={13} /> Tải lại
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Đang tải…</div>}
      {!loading && allItems.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 48 }}>
          <CheckCircle2 size={36} style={{ opacity: .3, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Không có giao dịch nào chờ duyệt</div>
        </div>
      )}

      <div style={{ padding: "0 16px" }}>
        {allItems.map(item => {
          const id = item.id || item.txId;
          const fromName = item.from_member_name || item.fromName || item.fromUid || item.from_member || "?";
          const toName = item.to_member_name || item.toName || item.toUid || item.to_member || "—";
          const pts = Number(item.points);
          const rawText = item.reason || item.rawText || "";
          const createdAt = item.created_at || Date.now();
          return (
            <div key={id} style={{ background: "var(--card)", border: "1px solid rgba(245,158,11,.35)", borderRadius: 13, padding: "14px 15px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(245,158,11,.15)", color: "#f59e0b", fontWeight: 700 }}>
                  Chờ duyệt
                </span>
                <span style={{ fontSize: 11, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={10} /> {fmtTime(createdAt)}
                </span>
              </div>

              {/* From → To */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#f87171" }}>{fromName}</span>
                <span style={{ color: "var(--ink-dim)" }}>→</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#34d399" }}>{toName}</span>
                <span style={{ marginLeft: "auto", fontWeight: 800, fontSize: 16, color: "#f59e0b" }}>
                  {fmtPts(pts)} đ
                </span>
              </div>

              {rawText && (
                <div style={{ fontSize: 12, color: "var(--ink-dim)", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "6px 9px", marginBottom: 10, lineHeight: 1.5, wordBreak: "break-word" }}>
                  {rawText.length > 120 ? rawText.slice(0, 120) + "…" : rawText}
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleReject(id)} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: "rgba(248,113,113,.12)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <XCircle size={14} /> Từ chối
                </button>
                <button onClick={() => handleApprove(id)} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, background: "rgba(52,211,153,.15)", color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <CheckCircle2 size={14} /> Duyệt
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
