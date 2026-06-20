import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { Plus, Trash2, Save, X, ChevronDown, ChevronUp } from "lucide-react";

const TRIP_TYPES = [
  { value: "bao_xe",        label: "Bao xe" },
  { value: "ghep_1",        label: "Ghép 1 khách" },
  { value: "ghep_2",        label: "Ghép 2 khách" },
  { value: "ship",          label: "Gửi hàng / Ship" },
  { value: "san_bay_don",   label: "Đón sân bay" },
  { value: "san_bay_tien",  label: "Tiễn sân bay" },
  { value: "san_bay_2c",    label: "Sân bay 2 chiều" },
  { value: "tinh_1c",       label: "Tỉnh 1 chiều" },
  { value: "tinh_2c",       label: "Tỉnh 2 chiều" },
  { value: "city",          label: "Lịch city / nội thành" },
  { value: "khac",          label: "Khác" },
];

const emptyRule = () => ({ type: "bao_xe", min: "", max: "", points: "", note: "" });

export default function BaremTab({ groupId }) {
  const [rules, setRules] = useState([]);
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = () => {
    if (!groupId) return;
    setLoading(true);
    api.getRules(groupId).then(data => {
      try { setRules(JSON.parse(data.rules_json)?.rules || []); } catch { setRules([]); }
      setRawText(data.raw_text || "");
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [groupId]);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const save = async () => {
    setSaving(true);
    try {
      const rulesJson = JSON.stringify({ rules });
      await api.saveRules(groupId, { rules_json: rulesJson, raw_text: rawText });
      flash(true, "Đã lưu barem.");
    } catch (e) { flash(false, e.message); }
    finally { setSaving(false); }
  };

  const addRule = () => setRules(r => [...r, emptyRule()]);
  const removeRule = (i) => setRules(r => r.filter((_, idx) => idx !== i));
  const updateRule = (i, field, val) => setRules(r => r.map((rule, idx) => idx === i ? { ...rule, [field]: val } : rule));

  const inputSt = { boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none", width: "100%" };

  if (loading) return <div style={{ textAlign: "center", color: "var(--ink-dim)", padding: 32 }}>Đang tải…</div>;

  return (
    <div style={{ padding: "0 16px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 0 10px" }}>
        <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Biểu điểm (Barem)</span>
        <button onClick={save} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, border: "none", cursor: saving ? "default" : "pointer", fontWeight: 800, fontSize: 13, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
          <Save size={14} /> {saving ? "Đang lưu…" : "Lưu barem"}
        </button>
      </div>

      {msg && (
        <div style={{ padding: "9px 13px", borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600, background: msg.ok ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)", color: msg.ok ? "#34d399" : "#f87171", border: "1px solid " + (msg.ok ? "#34d39944" : "#f8717144") }}>
          {msg.text}
        </div>
      )}

      {/* Bảng quy tắc */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 70px 1fr 32px", gap: 8, padding: "8px 12px", background: "rgba(0,0,0,.2)", fontSize: 11, fontWeight: 700, color: "var(--ink-dim)", textTransform: "uppercase" }}>
          <span>Loại cuốc</span><span>Giá từ (k)</span><span>Giá đến (k)</span><span>Điểm</span><span>Ghi chú</span><span></span>
        </div>

        {rules.length === 0 && (
          <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--ink-dim)", fontSize: 13 }}>Chưa có quy tắc — bấm "Thêm quy tắc" để bắt đầu</div>
        )}

        {rules.map((rule, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 80px 80px 70px 1fr 32px", gap: 8, padding: "8px 12px", borderTop: i > 0 ? "1px solid var(--line)" : "none", alignItems: "center" }}>
            <select value={rule.type} onChange={e => updateRule(i, "type", e.target.value)} style={{ ...inputSt, padding: "7px 8px" }}>
              {TRIP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="number" placeholder="200" value={rule.min} onChange={e => updateRule(i, "min", e.target.value)} style={inputSt} />
            <input type="number" placeholder="499" value={rule.max} onChange={e => updateRule(i, "max", e.target.value)} style={inputSt} />
            <input type="number" step="0.5" placeholder="1.5" value={rule.points} onChange={e => updateRule(i, "points", e.target.value)} style={inputSt} />
            <input placeholder="Ghi chú…" value={rule.note} onChange={e => updateRule(i, "note", e.target.value)} style={inputSt} />
            <button onClick={() => removeRule(i)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(248,113,113,.1)", color: "#f87171", cursor: "pointer", display: "grid", placeItems: "center" }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={addRule} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10, border: "1px dashed var(--line)", background: "transparent", color: "var(--ink-dim)", fontWeight: 700, fontSize: 13, cursor: "pointer", width: "100%", justifyContent: "center", marginBottom: 20 }}>
        <Plus size={15} /> Thêm quy tắc
      </button>

      {/* Ghi chú barem nguyên văn */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <button onClick={() => setShowRaw(p => !p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--ink)", fontWeight: 700, fontSize: 13 }}>
          {showRaw ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          Ghi chú barem nguyên văn
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-dim)", fontWeight: 400 }}>Lưu quy định phức tạp không bảng nào biểu diễn được</span>
        </button>
        {showRaw && (
          <div style={{ padding: "0 14px 14px" }}>
            <textarea value={rawText} onChange={e => setRawText(e.target.value)} rows={8}
              placeholder={"Dán barem gốc vào đây để tham khảo...\nVí dụ: Phụ phí chờ sân bay sau 1.5h tính 50k/h\nLưu đêm 5c/7c = 700k ..."}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)", fontSize: 13, outline: "none", resize: "vertical", lineHeight: 1.6 }} />
            <p style={{ color: "var(--ink-dim)", fontSize: 11, margin: "6px 0 0", lineHeight: 1.5 }}>
              Phần này chỉ lưu tham khảo — hệ thống không đọc. Dùng cho các ngoại lệ phức tạp mà kế toán tự xử lý tay.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
