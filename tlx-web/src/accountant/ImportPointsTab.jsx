import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Download, Trash2, AlertCircle, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { api } from "./api.js";

// ---------- helpers ----------
function normName(s) {
  return (s || "")
    .toLowerCase().trim()
    .replace(/đ/g, "d")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function findMatch(members, excelName) {
  const raw = (excelName || "").trim();
  if (!raw) return null;
  // Normalize chỉ để dự phòng (strip dấu) — KHÔNG dùng làm bước đầu
  const norm  = normName(raw);
  // So sánh giữ nguyên dấu, chỉ lowercase + chuẩn khoảng trắng
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const mLower = (m) => (m.alias || m.display_name || "").toLowerCase().replace(/\s+/g, " ");
  const mNorm  = (m) => normName(m.alias || m.display_name);

  // 1. Exact case-insensitive WITH dấu — alias ưu tiên
  let m = members.find(m => m.alias && m.alias.toLowerCase().replace(/\s+/g, " ") === lower);
  if (!m) m = members.find(m => (m.display_name || "").toLowerCase().replace(/\s+/g, " ") === lower);
  if (m) return m;

  // 2. Exact normalized (strip dấu) — chỉ khi không có ambiguity
  const normExact = members.filter(m => mNorm(m) === norm);
  if (normExact.length === 1) return normExact[0];
  if (normExact.length > 1) return null; // nhiều người cùng normalized → không đoán

  // 3. Partial normalized — chỉ khi không có ambiguity
  const partial = members.filter(m => {
    const s = mNorm(m);
    return s.length >= 3 && (s.includes(norm) || norm.includes(s));
  });
  if (partial.length === 1) return partial[0];

  return null;
}

const fmtPts = (v) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); };

const th = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "var(--ink-dim)", whiteSpace: "nowrap", userSelect: "none" };
const td = { padding: "7px 10px", verticalAlign: "middle" };

// ---------- component ----------
export default function ImportPointsTab({ groupId }) {
  const [step, setStep] = useState("upload");
  const [previewRows, setPreviewRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  const downloadTemplate = () => {
    const rows = [
      { "STT": 1, "Tên Zalo": "Nguyễn Văn A", "Điểm": 2.5 },
      { "STT": 2, "Tên Zalo": "Trần Thị B", "Điểm": 3 },
      { "STT": 3, "Tên Zalo": "Lê Văn C", "Điểm": 1.5 },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 32 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Import Điểm");
    XLSX.writeFile(wb, "mau-import-diem.xlsx");
  };

  const processFile = async (file) => {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const [mems, buf] = await Promise.all([
        api.listMembers(groupId),
        file.arrayBuffer(),
      ]);

      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const parsed = rawRows.map((r) => {
        const keys = Object.keys(r);
        const find = (...names) => keys.find(k => names.some(n => normName(k).replace(/\s/g,"") === n));
        const nameKey = find("tenzalo","ten","name","hovaten","hoten","displayname","tênzalo","tên","họtên");
        const ptsKey  = find("diem","điểm","points","diemthuong","điểmthưởng","điểmthưởng","dk");
        return {
          excelName:   String(r[nameKey] || "").trim(),
          excelPoints: parseFloat(String(r[ptsKey] || "0").replace(",", ".")) || 0,
        };
      }).filter(r => r.excelName);

      if (parsed.length === 0) {
        setErr("File không có dữ liệu hoặc thiếu cột. Cần cột: Tên Zalo, Điểm");
        setBusy(false);
        return;
      }

      let uid = 0;
      const preview = parsed.map((r) => {
        const matched = findMatch(mems, r.excelName);
        const sysPoints = matched ? (Number(matched.points) || 0) : 0;
        return {
          id: uid++,
          zaloUid:      matched?.zalo_uid || null,
          systemName:   matched ? (matched.alias || matched.display_name || matched.zalo_uid) : null,
          excelName:    r.excelName,
          systemPoints: sysPoints,
          excelPoints:  r.excelPoints,
          totalPoints:  +(sysPoints + r.excelPoints).toFixed(10),
          isNew:        !matched,
        };
      });

      setPreviewRows(preview);
      setStep("preview");
    } catch (e) {
      setErr("Không đọc được file: " + (e.message || "lỗi không xác định"));
    } finally {
      setBusy(false);
    }
  };

  const handleFileInput = (e) => { processFile(e.target.files?.[0]); e.target.value = ""; };
  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const updateTotal = (id, val) =>
    setPreviewRows(prev => prev.map(r => r.id === id ? { ...r, totalPoints: val } : r));

  const deleteRow = (id) =>
    setPreviewRows(prev => prev.filter(r => r.id !== id));

  const doImport = async () => {
    setShowConfirm(false);
    setBusy(true);
    try {
      const rows = previewRows.map(r => ({
        zaloUid:       r.zaloUid,
        name:          r.excelName,
        currentPoints: r.systemPoints,
        finalPoints:   Number(r.totalPoints) || 0,
        isNew:         r.isNew,
      }));
      const res = await api.importPoints(groupId, rows);
      setResult(res);
      setStep("done");
    } catch (e) {
      setErr("Lỗi import: " + e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setStep("upload"); setPreviewRows([]); setResult(null); setErr(""); };

  // ===== DONE =====
  if (step === "done") return (
    <div style={{ padding: "60px 24px", textAlign: "center" }}>
      <CheckCircle2 size={56} style={{ color: "var(--accent)", marginBottom: 16 }} />
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Import hoàn tất!</div>
      <div style={{ color: "var(--ink-dim)", fontSize: 14, marginBottom: 28, lineHeight: 1.7 }}>
        Đã cập nhật <strong style={{ color: "var(--ink)" }}>{result?.updated || 0}</strong> thành viên hiện có
        {result?.created > 0 && <>, tạo mới <strong style={{ color: "#fb923c" }}>{result.created}</strong> thành viên</>}
        {result?.skipped > 0 && <>, bỏ qua <strong style={{ color: "var(--ink-dim)" }}>{result.skipped}</strong> không đổi</>}.
      </div>
      <button onClick={reset}
        style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: "rgba(52,211,153,.2)", color: "var(--accent)", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
        Import thêm
      </button>
    </div>
  );

  // ===== PREVIEW =====
  if (step === "preview") {
    const newCount = previewRows.filter(r => r.isNew).length;
    const existCount = previewRows.filter(r => !r.isNew).length;
    return (
      <div style={{ padding: "0 24px 32px" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0 14px", flexWrap: "wrap" }}>
          <button onClick={reset}
            style={{ padding: "7px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            ← Chọn lại file
          </button>
          <div style={{ flex: 1, fontSize: 13, color: "var(--ink-dim)" }}>
            <strong style={{ color: "var(--ink)" }}>{previewRows.length} dòng</strong>
            {existCount > 0 && <> · {existCount} HT</>}
            {newCount > 0 && <> · <span style={{ color: "#fb923c" }}>{newCount} mới</span></>}
          </div>
          <button onClick={() => { if (previewRows.length > 0) setShowConfirm(true); }}
            disabled={busy || previewRows.length === 0}
            style={{ padding: "8px 22px", borderRadius: 9, border: "none", background: previewRows.length ? "rgba(52,211,153,.2)" : "rgba(255,255,255,.06)", color: previewRows.length ? "var(--accent)" : "var(--ink-dim)", fontWeight: 700, cursor: previewRows.length ? "pointer" : "default", fontSize: 14 }}>
            {busy ? "Đang import…" : "Import"}
          </button>
        </div>

        {err && (
          <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, fontSize: 13, color: "#f87171", display: "flex", gap: 8, alignItems: "center" }}>
            <AlertCircle size={14} />{err}
          </div>
        )}

        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--card)" }}>
                <th style={{ ...th, width: 44 }}>STT</th>
                <th style={th}>Tên hệ thống</th>
                <th style={th}>Tên Excel</th>
                <th style={{ ...th, textAlign: "right" }}>Điểm HT</th>
                <th style={{ ...th, textAlign: "right" }}>Điểm Excel</th>
                <th style={{ ...th, textAlign: "right" }}>Điểm Tổng</th>
                <th style={{ ...th, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r, i) => (
                <tr key={r.id}
                  style={{ borderTop: "1px solid var(--line)", background: r.isNew ? "rgba(251,146,60,.04)" : "transparent" }}>
                  <td style={{ ...td, color: "var(--ink-dim)", textAlign: "center", fontSize: 12 }}>{i + 1}</td>
                  <td style={td}>
                    {r.isNew
                      ? <span style={{ color: "#fb923c", fontSize: 12, fontStyle: "italic" }}>Thành viên mới</span>
                      : <span style={{ fontWeight: 500 }}>{r.systemName}</span>}
                  </td>
                  <td style={{ ...td, color: "var(--ink-dim)" }}>{r.excelName}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace" }}>{fmtPts(r.systemPoints)}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "monospace", color: r.excelPoints >= 0 ? "#34d399" : "#f87171" }}>
                    {r.excelPoints >= 0 ? "+" : ""}{fmtPts(r.excelPoints)}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <input
                      type="number" step="0.5"
                      value={r.totalPoints}
                      onChange={e => updateTotal(r.id, e.target.value)}
                      style={{ width: 76, textAlign: "right", padding: "4px 7px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 13, fontFamily: "monospace" }}
                    />
                  </td>
                  <td style={td}>
                    <button onClick={() => deleteRow(r.id)} title="Xóa dòng này"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: "4px", borderRadius: 6, display: "flex", alignItems: "center" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--ink-dim)"}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {previewRows.length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "var(--ink-dim)", padding: "32px 0" }}>Không còn dòng nào</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Confirm modal */}
        {showConfirm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "grid", placeItems: "center", zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
            <div style={{ background: "var(--card)", borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "90%", border: "1px solid var(--line)" }}>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Xác nhận Import Điểm?</div>
              <div style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.7, marginBottom: 22 }}>
                {existCount > 0 && <div>· Cập nhật <strong style={{ color: "var(--ink)" }}>{existCount}</strong> thành viên hiện có</div>}
                {newCount > 0 && <div>· Tạo mới <strong style={{ color: "#fb923c" }}>{newCount}</strong> thành viên</div>}
                <div style={{ marginTop: 8, color: "#f87171", fontSize: 12 }}>Hành động này thay đổi điểm thực — kiểm tra kỹ trước khi xác nhận.</div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowConfirm(false)}
                  style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                  Hủy
                </button>
                <button onClick={doImport}
                  style={{ padding: "8px 22px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.2)", color: "var(--accent)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  Xác nhận Import
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===== UPLOAD =====
  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Import Điểm từ Excel</div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
            File Excel cần có cột: <code style={{ background: "rgba(255,255,255,.07)", padding: "1px 5px", borderRadius: 4 }}>STT</code>,{" "}
            <code style={{ background: "rgba(255,255,255,.07)", padding: "1px 5px", borderRadius: 4 }}>Tên Zalo</code>,{" "}
            <code style={{ background: "rgba(255,255,255,.07)", padding: "1px 5px", borderRadius: 4 }}>Điểm</code>
          </div>
        </div>
        <button onClick={downloadTemplate}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--ink-dim)", fontWeight: 600, flexShrink: 0 }}>
          <Download size={14} /> Tải file mẫu
        </button>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--line)"}`,
          borderRadius: 16, padding: "56px 24px", textAlign: "center",
          cursor: busy ? "default" : "pointer",
          background: dragging ? "rgba(52,211,153,.05)" : "transparent",
          transition: "border-color .15s, background .15s",
        }}>
        <FileSpreadsheet size={44} style={{ color: dragging ? "var(--accent)" : "var(--ink-dim)", marginBottom: 14, transition: "color .15s" }} />
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6, color: busy ? "var(--ink-dim)" : "var(--ink)" }}>
          {busy ? "Đang xử lý…" : dragging ? "Thả file vào đây" : "Nhấn để chọn file hoặc kéo thả vào đây"}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Hỗ trợ .xlsx, .xls, .csv</div>
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFileInput} />

      {err && (
        <div style={{ marginTop: 14, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />{err}
        </div>
      )}

      {/* Hướng dẫn */}
      <div style={{ marginTop: 24, background: "var(--card)", borderRadius: 12, padding: "16px 20px", border: "1px solid var(--line)" }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "var(--ink)" }}>Cách hoạt động</div>
        {[
          ["1.", "Upload file Excel → hệ thống đọc cột Tên Zalo & Điểm"],
          ["2.", "Tự động ghép tên với thành viên trong hệ thống (so sánh tên gần đúng)"],
          ["3.", "Xem trước bảng: Điểm Tổng = Điểm HT + Điểm Excel — có thể sửa trực tiếp"],
          ["4.", "Xóa dòng không muốn import → nhấn Import → xác nhận"],
          ["5.", "Tên chưa có trong hệ thống → tự động tạo thành viên mới"],
        ].map(([n, t]) => (
          <div key={n} style={{ display: "flex", gap: 10, marginBottom: 7, fontSize: 13, color: "var(--ink-dim)" }}>
            <span style={{ fontWeight: 700, color: "var(--accent)", flexShrink: 0, width: 20 }}>{n}</span>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
