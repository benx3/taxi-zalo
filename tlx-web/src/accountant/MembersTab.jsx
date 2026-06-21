import React, { useState, useEffect, useMemo } from "react";
import { api } from "./api.js";
import {
  Users, Search, Plus, ChevronRight, TrendingUp, TrendingDown,
  X, Check, Clock, Edit2, Trash2, AlertTriangle, RefreshCw
} from "lucide-react";

const PAGE_SIZE = 25;

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
const noMark = (s) => (s || "").toLowerCase()
  .replace(/đ/gi, "d")
  .normalize("NFD")
  .replace(/\p{Mn}/gu, "");

const fmtPts = (p) => {
  const n = Number(p) || 0;
  return (n >= 0 ? "+" : "") + n.toFixed(n % 1 === 0 ? 0 : 1) + "đ";
};
const fmtTime = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function buildPageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

export default function MembersTab({ groupId }) {
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState({ ok: null, text: "" });
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [sortBy, setSortBy] = useState("points_desc");

  const reload = () => {
    if (!groupId) return;
    setLoading(true);
    api.listMembers(groupId).then(setMembers).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, [groupId]);
  useEffect(() => { setPage(1); setInlineEdit(null); }, [q, groupId, sortBy]);

  const syncFromZalo = async () => {
    setSyncing(true); setSyncMsg({ ok: null, text: "" });
    try {
      const r = await api.syncMembers();
      await api.listMembers(groupId).then(setMembers);
      const parts = [`Tổng ${r.total} thành viên`];
      if (r.added) parts.push(`+${r.added} mới`);
      if (r.removed) parts.push(`-${r.removed} đã rời`);
      setSyncMsg({ ok: true, text: parts.join(" · ") });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
    } finally { setSyncing(false); }
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return members;
    const s = noMark(q);
    return members.filter(m =>
      noMark(m.display_name).includes(s) ||
      (m.phone || "").includes(q.trim()) ||
      (m.zalo_uid || "").includes(q.trim())
    );
  }, [members, q]);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name_asc")   return (a.display_name || "").localeCompare(b.display_name || "", "vi");
    if (sortBy === "name_desc")  return (b.display_name || "").localeCompare(a.display_name || "", "vi");
    if (sortBy === "points_asc") return (a.points || 0) - (b.points || 0);
    return (b.points || 0) - (a.points || 0); // points_desc (default)
  });
  const totalPages = Math.ceil(Math.max(sorted.length, 1) / PAGE_SIZE);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const startEdit = (e, m) => {
    e.stopPropagation();
    if (inlineEdit?.id === m.id) { setInlineEdit(null); return; }
    setInlineEdit({ id: m.id, zaloUid: m.zalo_uid, name: m.display_name, delta: "", reason: "", saving: false, err: "" });
  };

  const saveInlineEdit = async () => {
    const d = parseFloat(inlineEdit.delta);
    if (isNaN(d) || d === 0) { setInlineEdit(ie => ({ ...ie, err: "Nhập số khác 0" })); return; }
    setInlineEdit(ie => ({ ...ie, saving: true, err: "" }));
    try {
      await api.adjustPoints({ groupId, zaloUid: inlineEdit.zaloUid, delta: d, reason: inlineEdit.reason || "Kế toán chỉnh tay", displayName: inlineEdit.name });
      setInlineEdit(null);
      reload();
    } catch (e) {
      setInlineEdit(ie => ({ ...ie, saving: false, err: e.message }));
    }
  };

  if (selected) return (
    <MemberDetail member={selected} groupId={groupId} onBack={() => { setSelected(null); reload(); }} />
  );

  return (
    <div style={{ padding: "0 0 24px" }}>
      {/* Header + search + add */}
      <div style={{ display: "flex", gap: 8, padding: "16px 24px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / SĐT / Zalo ID…"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={syncFromZalo} disabled={syncing} title="Cập nhật thành viên từ Zalo: thêm mới + xóa người đã rời nhóm" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: syncing ? "var(--ink-dim)" : "#60a5fa", fontWeight: 700, fontSize: 13, cursor: syncing ? "default" : "pointer", whiteSpace: "nowrap" }}>
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? "Đang cập nhật…" : "Cập nhật thành viên"}
        </button>
        <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--accent-dim)", background: "rgba(52,211,153,.15)", color: "var(--accent)", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
          <Plus size={15} /> Thêm
        </button>
      </div>
      {syncMsg.text && (
        <div style={{ margin: "0 24px 8px", padding: "8px 14px", borderRadius: 9, background: syncMsg.ok ? "rgba(52,211,153,.1)" : "rgba(248,113,113,.1)", color: syncMsg.ok ? "#34d399" : "#f87171", fontSize: 13, fontWeight: 600 }}>
          {syncMsg.text}
        </div>
      )}

      {/* Tổng kết */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "0 24px 14px" }}>
        <StatCard label="Thành viên" value={members.length} color="#60a5fa" />
        <StatCard label="Dương (+)" value={members.filter(m => m.points > 0).length} color="#34d399" />
        <StatCard label="Âm (−)" value={members.filter(m => m.points < 0).length} color="#f87171" />
      </div>

      {/* Danh sách */}
      <div style={{ padding: "0 24px" }}>
        {loading && <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 24 }}>Đang tải…</div>}
        {!loading && sorted.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 32 }}>
            <Users size={32} style={{ opacity: .3, marginBottom: 8 }} /><br />
            {q ? "Không tìm thấy thành viên" : "Chưa có thành viên nào"}
          </div>
        )}

        {sorted.length > 0 && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
          {/* Header bảng */}
          <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 38px", padding: "6px 4px 6px 12px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            <span>#</span>
            <button onClick={() => setSortBy(s => s === "name_asc" ? "name_desc" : "name_asc")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: sortBy.startsWith("name") ? "var(--accent)" : "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3 }}>
              Tên {sortBy === "name_asc" ? "↑" : sortBy === "name_desc" ? "↓" : ""}
            </button>
            <button onClick={() => setSortBy(s => s === "points_desc" ? "points_asc" : "points_desc")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 8px 0 0", textAlign: "right", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: sortBy.startsWith("points") ? "var(--accent)" : "var(--ink-dim)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
              {sortBy === "points_asc" ? "↑" : sortBy === "points_desc" ? "↓" : ""} Điểm
            </button>
            <span />
          </div>

        {paged.map((m, i) => {
          const rank = (page - 1) * PAGE_SIZE + i + 1;
          const isEditing = inlineEdit?.id === m.id;
          return (
            <React.Fragment key={m.id}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 72px 38px", alignItems: "center", borderBottom: "1px solid var(--line)", background: isEditing ? "rgba(52,211,153,.05)" : "transparent" }}>
                <span style={{ padding: "0 0 0 12px", fontSize: 12, color: "var(--ink-dim)", fontWeight: 600 }}>{rank}</span>
                <button onClick={() => setSelected(m)} style={{ padding: "11px 6px", background: "none", border: "none", cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
                  {m.display_name || m.zalo_uid}
                </button>
                <div style={{ fontWeight: 800, fontSize: 15, color: pointColor(m.points), textAlign: "right", paddingRight: 8 }}>
                  {fmtPts(m.points)}
                </div>
                <button onClick={(e) => startEdit(e, m)} title="Chỉnh điểm nhanh"
                  style={{ alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderLeft: "1px solid var(--line)", cursor: "pointer", color: isEditing ? "var(--accent)" : "var(--ink-dim)" }}>
                  <Edit2 size={13} />
                </button>
              </div>
              {isEditing && (
                <div style={{ background: "rgba(52,211,153,.05)", borderBottom: "1px solid var(--line)", borderTop: "1px solid rgba(52,211,153,.2)", padding: "10px 12px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="number" step="0.5" placeholder="±điểm"
                    value={inlineEdit.delta}
                    onChange={e => setInlineEdit(ie => ({ ...ie, delta: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && saveInlineEdit()}
                    autoFocus
                    style={{ width: 90, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "rgba(0,0,0,.25)", color: "var(--ink)", fontSize: 14, fontWeight: 700, outline: "none" }}
                  />
                  <input
                    placeholder="Lý do (tuỳ chọn)"
                    value={inlineEdit.reason}
                    onChange={e => setInlineEdit(ie => ({ ...ie, reason: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && saveInlineEdit()}
                    style={{ flex: 1, minWidth: 120, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "rgba(0,0,0,.25)", color: "var(--ink)", fontSize: 13, outline: "none" }}
                  />
                  {inlineEdit.err && <span style={{ color: "#f87171", fontSize: 12, flexBasis: "100%" }}>{inlineEdit.err}</span>}
                  <button onClick={saveInlineEdit} disabled={inlineEdit.saving}
                    style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "rgba(52,211,153,.2)", color: "#34d399", fontWeight: 700, fontSize: 13, cursor: inlineEdit.saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    {inlineEdit.saving ? "…" : <><Check size={13} /> Lưu</>}
                  </button>
                  <button onClick={() => setInlineEdit(null)}
                    style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "rgba(248,113,113,.1)", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center" }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </React.Fragment>
          );
        })}

        </div>
        )}{/* end table container */}

        {/* Phân trang số */}
        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, paddingTop: 14, flexWrap: "wrap" }}>
            <button onClick={() => { setPage(p => Math.max(1, p - 1)); setInlineEdit(null); }} disabled={page === 1}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: page === 1 ? "var(--ink-dim)" : "var(--ink)", cursor: page === 1 ? "default" : "pointer", fontSize: 13 }}>‹</button>
            {buildPageList(page, totalPages).map((p, idx) =>
              p === "…"
                ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>…</span>
                : <button key={p} onClick={() => { setPage(p); setInlineEdit(null); }}
                    style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid", borderColor: p === page ? "var(--accent)" : "var(--line)", background: p === page ? "rgba(52,211,153,.15)" : "transparent", color: p === page ? "var(--accent)" : "var(--ink)", fontWeight: p === page ? 800 : 400, fontSize: 13, cursor: "pointer" }}>
                    {p}
                  </button>
            )}
            <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); setInlineEdit(null); }} disabled={page === totalPages}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: page === totalPages ? "var(--ink-dim)" : "var(--ink)", cursor: page === totalPages ? "default" : "pointer", fontSize: 13 }}>›</button>
            <span style={{ fontSize: 11, color: "var(--ink-dim)", marginLeft: 6 }}>{sorted.length} người</span>
          </div>
        )}
      </div>

      {showAdd && <AddMemberModal groupId={groupId} onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); reload(); }} />}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontWeight: 800, fontSize: 20, color }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function pointColor(p) {
  const n = Number(p) || 0;
  return n > 0 ? "#34d399" : n < 0 ? "#f87171" : "#94a3b8";
}

// ===== Chi tiết thành viên =====
function ConvoThread({ raw }) {
  let c = null;
  try { c = typeof raw === "string" ? JSON.parse(raw) : null; } catch {}
  if (c?.tripText) {
    const row = (time, name, msg, color) => (
      <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--ink-dim)", whiteSpace: "nowrap", paddingTop: 1 }}>{time}</span>
        <span style={{ fontSize: 11, color: color || "var(--ink-dim)" }}>
          <b style={{ color: "var(--ink)", marginRight: 3 }}>{name}:</b>{msg}
        </span>
      </div>
    );
    return (
      <div style={{ background: "rgba(0,0,0,.25)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginTop: 5, lineHeight: 1.45 }}>
        {row(c.tripTime, c.tripPoster, c.tripText, null)}
        {c.claimText && row(c.claimTime, c.claimer, c.claimText, "#60a5fa")}
        {c.confirmText && row(c.confirmTime, c.confirmPoster, c.confirmText, "#34d399")}
      </div>
    );
  }
  if (raw && !raw.startsWith("{")) {
    return (
      <div style={{ background: "rgba(0,0,0,.2)", border: "1px solid var(--line)", borderRadius: 8, padding: "7px 10px", marginTop: 5, fontSize: 11, color: "var(--ink-dim)", wordBreak: "break-word" }}>
        {raw.length > 120 ? raw.slice(0, 120) + "…" : raw}
      </div>
    );
  }
  return null;
}

function MemberDetail({ member, groupId, onBack }) {
  const [m, setM] = useState(member);
  const [txs, setTxs] = useState([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);

  const reload = () => {
    setLoadingTx(true);
    Promise.all([
      api.listMembers(groupId).then(list => { const found = list.find(x => x.zalo_uid === member.zalo_uid); if (found) setM(found); }),
      api.listTransactions(groupId, member.zalo_uid, 50).then(setTxs),
    ]).catch(() => {}).finally(() => setLoadingTx(false));
  };
  useEffect(() => { reload(); }, []);

  return (
    <div style={{ padding: "0 0 80px" }}>
      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px", borderBottom: "1px solid var(--line)" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4 }}>← Quay lại</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{m.display_name || m.zalo_uid}</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>{m.phone || ""} {m.zalo_uid}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, color: pointColor(m.points) }}>{fmtPts(m.points)}</div>
      </div>

      {/* Nút chỉnh điểm */}
      <div style={{ padding: "12px 16px" }}>
        <button onClick={() => setShowAdjust(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--accent-dim)", background: "rgba(52,211,153,.1)", color: "var(--accent)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Edit2 size={14} /> Chỉnh điểm thủ công
        </button>
      </div>

      {/* Lịch sử giao dịch */}
      <div style={{ padding: "0 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>LỊCH SỬ GIAO DỊCH</div>
        {loadingTx && <div style={{ color: "var(--ink-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Đang tải…</div>}
        {!loadingTx && txs.length === 0 && <div style={{ color: "var(--ink-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Chưa có giao dịch nào</div>}
        {txs.map(tx => {
          const delta = tx.to_member === member.zalo_uid ? +tx.points : -tx.points;
          return (
            <div key={tx.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, background: delta >= 0 ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                  {delta >= 0 ? <TrendingUp size={15} color="#34d399" /> : <TrendingDown size={15} color="#f87171" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>{tx.reason || (tx.type === "auto" ? "Tự động" : "Thủ công")}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2, display: "flex", gap: 8 }}>
                    <span><Clock size={10} /> {fmtTime(tx.created_at)}</span>
                    {tx.type === "barem" && <span style={{ color: "#a78bfa" }}>barem</span>}
                    {tx.type === "san" && <span style={{ color: "#60a5fa" }}>san điểm</span>}
                  </div>
                  {tx.raw_text && <ConvoThread raw={tx.raw_text} />}
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: delta >= 0 ? "#34d399" : "#f87171", flexShrink: 0 }}>
                  {delta >= 0 ? "+" : ""}{delta.toFixed(delta % 1 === 0 ? 0 : 1)}đ
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdjust && (
        <AdjustPointsModal groupId={groupId} member={m} onClose={() => setShowAdjust(false)} onDone={() => { setShowAdjust(false); reload(); }} />
      )}
    </div>
  );
}

// ===== Modal chỉnh điểm =====
function AdjustPointsModal({ groupId, member, onClose, onDone }) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const d = parseFloat(delta);
    if (isNaN(d) || d === 0) { setErr("Nhập số điểm khác 0"); return; }
    setSaving(true); setErr("");
    try {
      await api.adjustPoints({ groupId, zaloUid: member.zalo_uid, delta: d, reason: reason || "Kế toán chỉnh tay", displayName: member.display_name });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "var(--card)", borderRadius: 18, padding: 20, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Edit2 size={17} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Chỉnh điểm — {member.display_name || member.zalo_uid}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 4 }}>Điểm hiện tại: <b style={{ color: pointColor(member.points) }}>{fmtPts(member.points)}</b></div>
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 6, marginTop: 14 }}>Số điểm cộng/trừ (dùng − để trừ)</label>
        <input type="number" step="0.5" value={delta} onChange={e => setDelta(e.target.value)} placeholder="Ví dụ: 2 hoặc -1.5"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 14, outline: "none" }} />
        <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 6, marginTop: 12 }}>Lý do</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Bán điểm / Điều chỉnh sai / …"
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }}
          onKeyDown={e => e.key === "Enter" && submit()} />
        {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{err}</div>}
        <button onClick={submit} disabled={saving} style={{ width: "100%", marginTop: 16, padding: "12px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
          {saving ? "Đang lưu…" : "Xác nhận"}
        </button>
      </div>
    </div>
  );
}

// ===== Modal thêm thành viên =====
function AddMemberModal({ groupId, onClose, onDone }) {
  const [zaloUid, setZaloUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!zaloUid.trim()) { setErr("Nhập Zalo UID"); return; }
    setSaving(true); setErr("");
    try {
      await api.upsertMember({ groupId, zaloUid: zaloUid.trim(), display_name: displayName.trim() || null, phone: phone.trim() || null });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, background: "var(--card)", borderRadius: 18, padding: 20, border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Plus size={17} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Thêm thành viên</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>
        {[["Zalo UID *", zaloUid, setZaloUid, "ID Zalo (định danh chính)"],
          ["Tên hiển thị", displayName, setDisplayName, "Tên trong nhóm"],
          ["Số điện thoại", phone, setPhone, "SĐT (tuỳ chọn)"]].map(([lbl, val, set, ph]) => (
          <div key={lbl} style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>{lbl}</label>
            <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }} />
          </div>
        ))}
        {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{err}</div>}
        <button onClick={submit} disabled={saving} style={{ width: "100%", marginTop: 14, padding: "12px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
          {saving ? "Đang lưu…" : "Thêm"}
        </button>
      </div>
    </div>
  );
}
