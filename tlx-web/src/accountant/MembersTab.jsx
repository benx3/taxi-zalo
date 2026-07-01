import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { api } from "./api.js";
import {
  Users, Search, Plus, ChevronRight, TrendingUp, TrendingDown,
  X, Check, Clock, Edit2, Trash2, AlertTriangle, RefreshCw, Download, Upload, Ban
} from "lucide-react";

const PAGE_SIZE = 25;

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu
const noMark = (s) => (s || "").toLowerCase()
  .replace(/đ/gi, "d")
  .normalize("NFD")
  .replace(/\p{Mn}/gu, "");

const fmtPts = (p) => {
  const n = Number(p) || 0;
  return (n >= 0 ? "+" : "") + parseFloat(n.toFixed(2)) + "đ";
};
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

export default function MembersTab({ groupId }) {
  const [members, setMembers] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState({ ok: null, text: "" });
  const [enriching, setEnriching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [page, setPage] = useState(1);
  const [inlineEdit, setInlineEdit] = useState(null);
  const [sortBy, setSortBy] = useState("points_desc");
  const importRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importConfirming, setImportConfirming] = useState(false);

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

  const enrichNames = async () => {
    if (!groupId) return;
    setEnriching(true); setSyncMsg({ ok: null, text: "" });
    try {
      const r = await api.enrichMemberNames(groupId);
      await api.listMembers(groupId).then(setMembers);
      const unnamed = r.total - r.unchanged - r.enriched;
      const parts = [`Lấy tên: ${r.enriched} thành công`];
      if (unnamed > 0) parts.push(`${unnamed} chưa lấy được`);
      setSyncMsg({ ok: true, text: parts.join(" · ") });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 6000);
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
    } finally { setEnriching(false); }
  };

  const filtered = useMemo(() => {
    if (!q.trim()) return members;
    const s = noMark(q);
    return members.filter(m =>
      noMark(m.alias).includes(s) ||
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

  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yestLabel = `${String(yestDate.getDate()).padStart(2,"0")}/${String(yestDate.getMonth()+1).padStart(2,"0")}`;
  const yestLabelFull = `${String(yestDate.getDate()).padStart(2,"0")}/${String(yestDate.getMonth()+1).padStart(2,"0")}/${yestDate.getFullYear()}`;

  const exportExcel = () => {
    const rows = sorted.map((m, i) => ({
      "STT": i + 1,
      "Tên Zalo": m.display_name || m.zalo_uid || "",
      "Hiện tại": Number(m.points) || 0,
      [`Điểm ${yestLabelFull}`]: m.points_yesterday != null ? Number(m.points_yesterday) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 36 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Thành viên");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `thanh-vien-${date}.xlsx`);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const rows = rawRows.map((r, i) => {
        const keys = Object.keys(r);
        const find = (...names) => keys.find(k => names.some(n => k.toLowerCase().trim().replace(/\s+/g,"") === n));
        const tenKey = find("ten","tên","name","họtên","hoten","displayname");
        const sdtKey = find("sdt","sđt","phone","sodienthoai","sốđiệnthoại","điệnthoại","dienthoai");
        const sttKey = find("stt","số","no","#","sốthứtự");
        return {
          stt: r[sttKey] || (i + 1),
          ten: String(r[tenKey] || "").trim(),
          sdt: String(r[sdtKey] || "").trim(),
        };
      }).filter(r => r.ten);
      if (rows.length === 0) {
        setSyncMsg({ ok: false, text: "File không có dữ liệu hoặc thiếu cột Tên (cần: STT, Tên, SĐT)" });
        setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
        return;
      }
      setImportLoading(true);
      setSyncMsg({ ok: null, text: `Đang tra cứu ${rows.length} thành viên trên Zalo, vui lòng chờ…` });
      try {
        const preview = await api.importMembersPreview(groupId, rows);
        setImportPreview(preview);
      } catch (err) {
        setSyncMsg({ ok: false, text: "Lỗi tra cứu: " + err.message });
        setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
      } finally {
        setImportLoading(false);
        setSyncMsg({ ok: null, text: "" });
      }
    } catch {
      setSyncMsg({ ok: false, text: "Không đọc được file Excel" });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 4000);
    }
  };

  const doImportConfirm = async () => {
    if (!importPreview) return;
    setImportConfirming(true);
    try {
      const r = await api.importMembersConfirm(groupId, importPreview);
      setImportPreview(null);
      setSyncMsg({ ok: true, text: `Đã import ${r.added} thành viên thành công.` });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
      reload();
    } catch (err) {
      setSyncMsg({ ok: false, text: "Lỗi import: " + err.message });
      setTimeout(() => setSyncMsg({ ok: null, text: "" }), 5000);
    } finally { setImportConfirming(false); }
  };

  if (selected) return (
    <MemberDetail member={selected} groupId={groupId} onBack={() => { setSelected(null); reload(); }} />
  );

  return (
    <div style={{ padding: "0 0 24px" }}>
      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          confirming={importConfirming}
          onConfirm={doImportConfirm}
          onClose={() => setImportPreview(null)}
        />
      )}
      {/* Header + search + add */}
      <div style={{ display: "flex", gap: 8, padding: "16px 24px", alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)" }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm tên / SĐT / Zalo ID…"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" }} />
        </div>
        <button onClick={syncFromZalo} disabled={syncing || enriching} title="Cập nhật thành viên từ Zalo: thêm mới + xóa người đã rời nhóm" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid var(--line)", background: "transparent", color: syncing ? "var(--ink-dim)" : "#60a5fa", fontWeight: 700, fontSize: 13, cursor: (syncing || enriching) ? "default" : "pointer", whiteSpace: "nowrap" }}>
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
          {syncing ? "Đang cập nhật…" : "Cập nhật"}
        </button>
        <button onClick={enrichNames} disabled={syncing || enriching} title="Lấy tên Zalo cho các thành viên chưa có tên (batch 50/lần, ~30s cho 1000 người)" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.1)", color: enriching ? "var(--ink-dim)" : "#a78bfa", fontWeight: 700, fontSize: 13, cursor: (syncing || enriching) ? "default" : "pointer", whiteSpace: "nowrap" }}>
          <RefreshCw size={14} style={{ animation: enriching ? "spin 1s linear infinite" : "none" }} />
          {enriching ? "Đang lấy tên…" : "Lấy tên"}
        </button>
        <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleImportFile} />
        <button onClick={() => importRef.current?.click()} disabled={importLoading} title="Import thành viên từ file Excel (cột STT, Tên, SĐT)"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(251,191,36,.4)", background: "rgba(251,191,36,.1)", color: importLoading ? "var(--ink-dim)" : "#fbbf24", fontWeight: 700, fontSize: 13, cursor: importLoading ? "default" : "pointer", whiteSpace: "nowrap", opacity: importLoading ? 0.6 : 1 }}>
          <Upload size={14} style={{ animation: importLoading ? "spin 1s linear infinite" : "none" }} /> {importLoading ? "Đang tra cứu…" : "Import Excel"}
        </button>
        <button onClick={exportExcel} disabled={sorted.length === 0} title="Xuất danh sách ra file Excel"
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(96,165,250,.4)", background: "rgba(96,165,250,.1)", color: "#60a5fa", fontWeight: 700, fontSize: 13, cursor: sorted.length === 0 ? "default" : "pointer", whiteSpace: "nowrap", opacity: sorted.length === 0 ? 0.5 : 1 }}>
          <Download size={14} /> Excel
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
          <div style={{ display: "grid", gridTemplateColumns: "36px 40px 1fr 72px 72px 38px", padding: "6px 4px 6px 12px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            <span>#</span><span />
            <button onClick={() => setSortBy(s => s === "name_asc" ? "name_desc" : "name_asc")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: sortBy.startsWith("name") ? "var(--accent)" : "var(--ink-dim)", display: "flex", alignItems: "center", gap: 3 }}>
              Tên {sortBy === "name_asc" ? "↑" : sortBy === "name_desc" ? "↓" : ""}
            </button>
            <button onClick={() => setSortBy(s => s === "points_desc" ? "points_asc" : "points_desc")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px 0 0", textAlign: "right", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: sortBy.startsWith("points") ? "var(--accent)" : "var(--ink-dim)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
              {sortBy === "points_asc" ? "↑" : sortBy === "points_desc" ? "↓" : ""} Hiện tại
            </button>
            <span style={{ textAlign: "right", paddingRight: 4, fontSize: 10, opacity: .7 }}>{yestLabel}</span>
            <span />
          </div>

        {paged.map((m, i) => {
          const rank = (page - 1) * PAGE_SIZE + i + 1;
          const isEditing = inlineEdit?.id === m.id;
          const yest = m.points_yesterday != null ? Number(m.points_yesterday) : null;
          return (
            <React.Fragment key={m.id}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 40px 1fr 72px 72px 38px", alignItems: "center", borderBottom: "1px solid var(--line)", background: isEditing ? "rgba(52,211,153,.05)" : "transparent" }}>
                <span style={{ padding: "0 0 0 12px", fontSize: 12, color: "var(--ink-dim)", fontWeight: 600 }}>{rank}</span>
                <div style={{ display: "flex", alignItems: "center", padding: "8px 0 8px 0" }}>
                  <ZaloAvatar uid={m.zalo_uid} name={m.display_name} src={m.avatar} size={32} />
                </div>
                <button onClick={() => setSelected(m)} style={{ padding: "10px 6px", background: "none", border: "none", cursor: "pointer", textAlign: "left", overflow: "hidden", color: "var(--ink)" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.alias || m.display_name || m.zalo_uid}
                    {m.alias && <span style={{ fontSize: 11, color: "var(--ink-dim)", fontWeight: 400, marginLeft: 5 }}>({m.display_name})</span>}
                    {(m.zalo_uid || "").startsWith("~imp_") && <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.15)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>TẠM</span>}
                    {m.is_out === 1 && <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", background: "rgba(148,163,184,.12)", border: "1px solid rgba(148,163,184,.3)", borderRadius: 4, padding: "1px 5px", marginLeft: 6 }}>OUT</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 1 }}>#{(m.zalo_uid || "").slice(-6)}{m.phone ? ` · ${m.phone}` : ""}</div>
                </button>
                <div style={{ fontWeight: 800, fontSize: 15, color: pointColor(m.points), textAlign: "right", paddingRight: 8 }}>
                  {fmtPts(m.points)}
                </div>
                <div style={{ textAlign: "right", paddingRight: 8, fontSize: 13, fontWeight: 700, color: yest != null ? pointColor(yest) : "var(--ink-dim)" }}>
                  {yest != null ? fmtPts(yest) : "—"}
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

function ImportPreviewModal({ preview, onConfirm, onClose, confirming }) {
  const countNew    = preview.filter(r => r.status === "found_new").length;
  const countExists = preview.filter(r => r.status === "found_exists").length;
  const countTemp   = preview.filter(r => r.status === "not_found" || r.status === "no_phone").length;
  const toImport    = countNew + countTemp;

  const badge = (status) => {
    if (status === "found_new")    return { text: "Thêm mới",   bg: "rgba(52,211,153,.15)",  color: "#34d399" };
    if (status === "found_exists") return { text: "Đã có",      bg: "rgba(148,163,184,.12)", color: "#94a3b8" };
    if (status === "not_found")    return { text: "Thêm tạm*",  bg: "rgba(251,191,36,.12)",  color: "#fbbf24" };
    return                                { text: "Thêm tạm",   bg: "rgba(96,165,250,.12)",  color: "#60a5fa" };
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 12px", overflowY: "auto" }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, width: "100%", maxWidth: 700 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ flex: 1, fontWeight: 800, fontSize: 15 }}>Xem trước import thành viên</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4 }}><X size={18} /></button>
        </div>

        {/* Tổng kết */}
        <div style={{ display: "flex", gap: 8, padding: "12px 18px", flexWrap: "wrap" }}>
          <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(52,211,153,.12)", color: "#34d399", fontSize: 12, fontWeight: 700 }}>+{countNew} thêm mới</span>
          <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(148,163,184,.1)", color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>{countExists} đã có (bỏ qua)</span>
          {countTemp > 0 && <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(251,191,36,.1)", color: "#fbbf24", fontSize: 12, fontWeight: 700 }}>{countTemp} thêm tạm</span>}
        </div>
        {countTemp > 0 && (
          <div style={{ padding: "0 18px 10px", fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>
            * Thêm tạm: không tìm thấy Zalo hoặc không có SĐT → lưu UID placeholder. UID thật sẽ tự cập nhật khi thành viên chat hoặc bị tag trong nhóm.
          </div>
        )}

        {/* Bảng */}
        <div style={{ maxHeight: 380, overflowY: "auto", borderTop: "1px solid var(--line)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,.25)", fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", textTransform: "uppercase", textAlign: "left" }}>
                <th style={{ padding: "8px 12px", width: 42 }}>STT</th>
                <th style={{ padding: "8px 12px" }}>Tên (Excel)</th>
                <th style={{ padding: "8px 12px", width: 110 }}>SĐT</th>
                <th style={{ padding: "8px 12px" }}>Tên Zalo</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => {
                const b = badge(row.status);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--line)", opacity: row.status === "found_exists" ? 0.45 : 1 }}>
                    <td style={{ padding: "8px 12px", color: "var(--ink-dim)", fontSize: 12 }}>{row.stt}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{row.ten}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "var(--ink-dim)" }}>{row.sdt || "—"}</td>
                    <td style={{ padding: "8px 12px", color: "var(--ink-dim)", fontSize: 12 }}>{row.zalo_name || "—"}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: b.bg, color: b.color }}>{b.text}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, padding: "14px 18px", borderTop: "1px solid var(--line)" }}>
          <button onClick={onClose} disabled={confirming} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", fontWeight: 600, cursor: confirming ? "default" : "pointer" }}>Hủy</button>
          <button onClick={onConfirm} disabled={confirming || toImport === 0}
            style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", fontWeight: 800, cursor: (confirming || toImport === 0) ? "default" : "pointer", opacity: confirming ? 0.6 : 1,
              background: toImport > 0 ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.05)",
              color: toImport > 0 ? "#04140a" : "var(--ink-dim)" }}>
            {confirming ? "Đang import…" : toImport > 0 ? `Xác nhận import ${toImport} thành viên` : "Không có thành viên mới"}
          </button>
        </div>
      </div>
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

const AVT_COLORS = ["#1e3a5f","#1a2e1a","#2a1a2a","#2a2a1a","#1a2a2a"];
function ZaloAvatar({ uid, name, src, size = 36 }) {
  const [imgErr, setImgErr] = useState(false);
  const bg = AVT_COLORS[(uid || "").charCodeAt(0) % AVT_COLORS.length];
  const initial = (name || "?")[0].toUpperCase();
  if (src && !imgErr) {
    return <img src={src} alt={name || uid} onError={() => setImgErr(true)}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: bg }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "grid", placeItems: "center", fontSize: size >= 44 ? 20 : 14, fontWeight: 700, flexShrink: 0, color: "#e2e8f0" }}>
      {initial}
    </div>
  );
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
        {c.freeText && row(c.freeTime, c.freePoster, c.freeText, "#fb923c")}
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

const TX_PAGE_SIZE = 20;

function MemberDetail({ member, groupId, onBack }) {
  const [m, setM] = useState(member);
  const [txs, setTxs] = useState([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const [showAdjust, setShowAdjust] = useState(false);
  const [editAlias, setEditAlias] = useState(false);
  const [aliasVal, setAliasVal] = useState(member.alias || "");
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasErr, setAliasErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [editingTx, setEditingTx] = useState(null);
  const isTemp = (m.zalo_uid || "").startsWith("~imp_");

  const doDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteMember(groupId, m.zalo_uid);
      onBack();
    } catch (e) {
      alert("Lỗi xóa: " + e.message);
      setDeleting(false); setConfirmDel(false);
    }
  };

  const reload = () => {
    setLoadingTx(true);
    Promise.all([
      api.listMembers(groupId).then(list => { const found = list.find(x => x.zalo_uid === member.zalo_uid); if (found) { setM(found); setAliasVal(found.alias || ""); } }),
      api.listTransactions(groupId, member.zalo_uid, 500).then(data => { setTxs(data); setTxPage(1); }),
    ]).catch(() => {}).finally(() => setLoadingTx(false));
  };
  useEffect(() => { reload(); }, []);

  const saveAlias = async () => {
    setAliasSaving(true); setAliasErr("");
    try {
      await api.setAlias({ groupId, zaloUid: m.zalo_uid, alias: aliasVal.trim() || null });
      setEditAlias(false); reload();
    } catch (e) { setAliasErr(e.message); }
    finally { setAliasSaving(false); }
  };

  return (
    <div style={{ padding: "0 0 80px" }}>
      {/* Back + header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px", borderBottom: "1px solid var(--line)" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4 }}>← Quay lại</button>
        <ZaloAvatar uid={m.zalo_uid} name={m.display_name} src={m.avatar} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.alias || m.display_name || m.zalo_uid}
            {m.alias && <span style={{ fontSize: 12, color: "var(--ink-dim)", fontWeight: 400, marginLeft: 6 }}>({m.display_name})</span>}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>#{m.zalo_uid}</div>
        </div>
        <div style={{ fontWeight: 800, fontSize: 22, color: pointColor(m.points), flexShrink: 0 }}>{fmtPts(m.points)}</div>
      </div>

      {/* Biệt danh + Chỉnh điểm + Xóa */}
      <div style={{ padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setShowAdjust(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--accent-dim)", background: "rgba(52,211,153,.1)", color: "var(--accent)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Edit2 size={14} /> Chỉnh điểm
        </button>
        <button onClick={() => setEditAlias(v => !v)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--line)", background: editAlias ? "rgba(96,165,250,.1)" : "transparent", color: "#60a5fa", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Edit2 size={14} /> {m.alias ? "Sửa biệt danh" : "Đặt biệt danh"}
        </button>
        {!confirmDel
          ? <button onClick={() => setConfirmDel(true)} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.08)", color: "#f87171", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Trash2 size={14} /> Xóa{isTemp ? " (thành viên tạm)" : ""}
            </button>
          : <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#f87171", fontWeight: 600 }}>Xóa thành viên này?</span>
              <button onClick={doDelete} disabled={deleting} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", fontWeight: 700, fontSize: 13, cursor: deleting ? "default" : "pointer" }}>
                {deleting ? "…" : "Xác nhận"}
              </button>
              <button onClick={() => setConfirmDel(false)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", cursor: "pointer" }}><X size={14} /></button>
            </div>
        }
      </div>
      {editAlias && (
        <div style={{ margin: "0 16px 12px", padding: "12px 14px", borderRadius: 10, background: "rgba(96,165,250,.07)", border: "1px solid rgba(96,165,250,.25)" }}>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Biệt danh để phân biệt tên trùng (ví dụ: "Anh Đức HN"). Để trống để xóa biệt danh.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={aliasVal} onChange={e => setAliasVal(e.target.value)} onKeyDown={e => e.key === "Enter" && saveAlias()}
              placeholder={m.display_name || "Nhập biệt danh…"}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 14, outline: "none" }} />
            <button onClick={saveAlias} disabled={aliasSaving} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.2)", color: "#34d399", fontWeight: 700, fontSize: 13, cursor: aliasSaving ? "default" : "pointer" }}>
              {aliasSaving ? "…" : <><Check size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Lưu</>}
            </button>
            <button onClick={() => { setEditAlias(false); setAliasVal(m.alias || ""); }} style={{ padding: "8px 10px", borderRadius: 9, border: "none", background: "rgba(248,113,113,.1)", color: "#f87171", cursor: "pointer" }}><X size={14} /></button>
          </div>
          {aliasErr && <div style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{aliasErr}</div>}
        </div>
      )}

      {/* Lịch sử giao dịch */}
      <div style={{ padding: "0 16px" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-dim)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          LỊCH SỬ GIAO DỊCH
          <span style={{ fontWeight: 400, fontSize: 11 }}>({txs.length} bản ghi)</span>
        </div>
        {loadingTx && <div style={{ color: "var(--ink-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Đang tải…</div>}
        {!loadingTx && txs.length === 0 && <div style={{ color: "var(--ink-dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Chưa có giao dịch nào</div>}
        {txs.slice((txPage - 1) * TX_PAGE_SIZE, txPage * TX_PAGE_SIZE).map(tx => {
          const isPending = (tx.status || "approved") === "pending";
          const delta = tx.to_member === member.zalo_uid ? +tx.points : -tx.points;
          return (
            <div key={tx.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)", opacity: tx.status === "rejected" ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 99, background: isPending ? "rgba(245,158,11,.15)" : delta >= 0 ? "rgba(52,211,153,.15)" : "rgba(248,113,113,.15)", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                  {isPending ? <Clock size={15} color="#f59e0b" /> : delta >= 0 ? <TrendingUp size={15} color="#34d399" /> : <TrendingDown size={15} color="#f87171" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>{tx.reason || (tx.type === "auto" ? "Tự động" : "Thủ công")}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span><Clock size={10} /> {fmtTime(tx.created_at)}</span>
                    {tx.type === "barem" && <span style={{ color: "#a78bfa" }}>barem</span>}
                    {tx.type === "san" && <span style={{ color: "#60a5fa" }}>san điểm</span>}
                    {isPending && <span style={{ color: "#f59e0b", fontWeight: 700 }}>⏳ chờ duyệt</span>}
                    {tx.status === "rejected" && <span style={{ color: "#f87171", fontWeight: 700 }}>✗ từ chối</span>}
                  </div>
                  {tx.raw_text && <ConvoThread raw={tx.raw_text} />}
                  {isPending ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button onClick={async () => { await api.approveTransfer(tx.id); reload(); }}
                        style={{ background: "rgba(52,211,153,.15)", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#34d399", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}>
                        <Check size={11} /> Duyệt
                      </button>
                      <button onClick={async () => { await api.rejectTransfer(tx.id); reload(); }}
                        style={{ background: "rgba(248,113,113,.1)", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}>
                        <Ban size={11} /> Từ chối
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setEditingTx(tx)}
                      style={{ marginTop: 5, background: "rgba(96,165,250,.1)", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#60a5fa", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700 }}>
                      <Edit2 size={10} /> Sửa điểm
                    </button>
                  )}
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, color: isPending ? "#f59e0b" : delta >= 0 ? "#34d399" : "#f87171", flexShrink: 0 }}>
                  {isPending ? `~${parseFloat(Math.abs(delta).toFixed(2))}đ` : `${delta >= 0 ? "+" : ""}${parseFloat(delta.toFixed(2))}đ`}
                </div>
              </div>
            </div>
          );
        })}

        {/* Phân trang giao dịch */}
        {txs.length > TX_PAGE_SIZE && (() => {
          const totalTxPages = Math.ceil(txs.length / TX_PAGE_SIZE);
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "14px 0", flexWrap: "wrap" }}>
              <button onClick={() => setTxPage(p => Math.max(1, p - 1))} disabled={txPage === 1}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: txPage === 1 ? "var(--ink-dim)" : "var(--ink)", cursor: txPage === 1 ? "default" : "pointer", fontSize: 13 }}>‹</button>
              {buildPageList(txPage, totalTxPages).map((p, idx) =>
                p === "…"
                  ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>…</span>
                  : <button key={p} onClick={() => setTxPage(p)}
                      style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid", borderColor: p === txPage ? "var(--accent)" : "var(--line)", background: p === txPage ? "rgba(52,211,153,.15)" : "transparent", color: p === txPage ? "var(--accent)" : "var(--ink)", fontWeight: p === txPage ? 800 : 400, fontSize: 13, cursor: "pointer" }}>
                      {p}
                    </button>
              )}
              <button onClick={() => setTxPage(p => Math.min(totalTxPages, p + 1))} disabled={txPage === totalTxPages}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", color: txPage === totalTxPages ? "var(--ink-dim)" : "var(--ink)", cursor: txPage === totalTxPages ? "default" : "pointer", fontSize: 13 }}>›</button>
              <span style={{ fontSize: 11, color: "var(--ink-dim)", marginLeft: 6 }}>Trang {txPage}/{totalTxPages}</span>
            </div>
          );
        })()}
      </div>

      {showAdjust && (
        <AdjustPointsModal groupId={groupId} member={m} onClose={() => setShowAdjust(false)} onDone={() => { setShowAdjust(false); reload(); }} />
      )}
      {editingTx && (
        <EditTxModal tx={editingTx} onClose={() => setEditingTx(null)} onDone={() => { setEditingTx(null); reload(); }} />
      )}
    </div>
  );
}

// ===== Modal sửa điểm giao dịch cụ thể =====
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
  const [tab, setTab] = useState("phone"); // "phone" | "uid"
  const [phone, setPhone] = useState("");
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState(null); // { uid, display_name, avatar }
  const [zaloUid, setZaloUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const lookup = async () => {
    if (!phone.trim()) { setErr("Nhập số điện thoại"); return; }
    setLooking(true); setErr(""); setFound(null);
    try {
      const u = await api.lookupUser(phone.trim());
      setFound(u);
    } catch (e) { setErr(e.message || "Không tìm thấy"); }
    finally { setLooking(false); }
  };

  const handlePhoneKey = (e) => { if (e.key === "Enter") lookup(); };

  const confirmFound = async () => {
    setSaving(true); setErr("");
    try {
      await api.upsertMember({ groupId, zaloUid: found.uid, display_name: found.display_name || null, phone: phone.trim() || null });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const submitManual = async () => {
    if (!zaloUid.trim()) { setErr("Nhập Zalo UID"); return; }
    setSaving(true); setErr("");
    try {
      await api.upsertMember({ groupId, zaloUid: zaloUid.trim(), display_name: displayName.trim() || null });
      onDone();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const inputStyle = { width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, display: "grid", placeItems: "center", background: "rgba(0,0,0,.6)", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: "var(--card)", borderRadius: 18, padding: 20, border: "1px solid var(--line)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <Plus size={17} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Thêm thành viên</span>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)" }}><X size={18} /></button>
        </div>

        {/* Tab chọn cách thêm */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "rgba(0,0,0,.2)", borderRadius: 10, padding: 4 }}>
          {[["phone", "Tìm theo SĐT"], ["uid", "Nhập UID thủ công"]].map(([t, lbl]) => (
            <button key={t} onClick={() => { setTab(t); setErr(""); setFound(null); }}
              style={{ flex: 1, padding: "7px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                background: tab === t ? "var(--accent)" : "transparent",
                color: tab === t ? "#04140a" : "var(--ink-dim)" }}>
              {lbl}
            </button>
          ))}
        </div>

        {tab === "phone" && (<>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>Số điện thoại Zalo</label>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={phone} onChange={e => { setPhone(e.target.value); setFound(null); setErr(""); }}
              onKeyDown={handlePhoneKey} placeholder="0912345678"
              style={{ ...inputStyle, flex: 1 }} />
            <button onClick={lookup} disabled={looking}
              style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: looking ? "default" : "pointer", fontWeight: 700, fontSize: 13, background: "rgba(96,165,250,.2)", color: "#60a5fa", whiteSpace: "nowrap" }}>
              {looking ? "…" : "Tìm"}
            </button>
          </div>

          {found && (
            <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#34d399", fontWeight: 700, marginBottom: 8 }}>Tìm thấy</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {found.avatar
                  ? <img src={found.avatar} style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#1e3a5f", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700, color: "#e2e8f0", flexShrink: 0 }}>{(found.display_name || "?")[0]}</div>
                }
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{found.display_name || "Không có tên"}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>UID: {found.uid}</div>
                </div>
              </div>
            </div>
          )}

          {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 10 }}>{err}</div>}
          <button onClick={confirmFound} disabled={!found || saving}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: (!found || saving) ? "default" : "pointer", fontWeight: 800, fontSize: 14,
              background: found ? "linear-gradient(135deg,#22c55e,#16a34a)" : "rgba(255,255,255,.07)", color: found ? "#04140a" : "var(--ink-dim)", opacity: (!found || saving) ? 0.6 : 1 }}>
            {saving ? "Đang thêm…" : "Thêm vào nhóm"}
          </button>
        </>)}

        {tab === "uid" && (<>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>Zalo UID *</label>
            <input value={zaloUid} onChange={e => setZaloUid(e.target.value)} placeholder="VD: 1234567890"
              style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>Tên hiển thị</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Tên trong nhóm (tuỳ chọn)"
              style={inputStyle} />
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 12, lineHeight: 1.5, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)", borderRadius: 8, padding: "8px 10px" }}>
            Lấy UID từ link profile Zalo: <b style={{ color: "var(--ink)" }}>zalo.me/[UID]</b>, hoặc xem trong lịch sử giao dịch nhóm.
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>{err}</div>}
          <button onClick={submitManual} disabled={saving}
            style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 14, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
            {saving ? "Đang lưu…" : "Thêm"}
          </button>
        </>)}
      </div>
    </div>
  );
}
