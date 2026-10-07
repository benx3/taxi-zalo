import React, { useState, useEffect } from "react";
import { Settings, Save, AlertTriangle, FlaskConical, Check, ShieldCheck, Smile } from "lucide-react";
import { api } from "./api.js";

const card = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14,
  padding: "18px 20px", marginBottom: 16,
};
const inp = {
  width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10,
  border: "1px solid var(--line)", background: "rgba(0,0,0,.2)", color: "var(--ink)",
  fontSize: 13.5, outline: "none",
};

/* Công tắc bật/tắt */
function Toggle({ on, onChange, label, desc, color = "#34d399" }) {
  return (
    <div onClick={() => onChange(!on)}
      style={{ display: "flex", alignItems: "flex-start", gap: 13, cursor: "pointer", userSelect: "none" }}>
      <div style={{
        width: 42, height: 24, borderRadius: 99, flexShrink: 0, marginTop: 1,
        background: on ? color + "33" : "rgba(255,255,255,.07)",
        border: `1px solid ${on ? color + "88" : "var(--line)"}`,
        position: "relative", transition: "all .18s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 99,
          background: on ? color : "var(--ink-dim)", transition: "left .18s",
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: on ? "var(--ink)" : "var(--ink-dim)" }}>{label}</div>
        {desc && <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.6, marginTop: 3 }}>{desc}</div>}
      </div>
    </div>
  );
}

export default function ConfigTab({ groupId }) {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!groupId) return;
    setCfg(null); setErr(""); setMsg(null);
    api.getGroupConfig(groupId).then(setCfg).catch(e => setErr(e.message || "Không tải được cấu hình"));
  }, [groupId]);

  const set = (patch) => setCfg(c => ({ ...c, ...patch }));

  const save = async () => {
    setSaving(true); setErr(""); setMsg(null);
    try {
      const saved = await api.saveGroupConfig(groupId, cfg);
      setCfg(saved);
      setMsg("Đã lưu cấu hình");
      setTimeout(() => setMsg(null), 4000);
    } catch (e) { setErr(e.message || "Lỗi lưu"); }
    finally { setSaving(false); }
  };

  if (err && !cfg) return (
    <div style={{ padding: 24, color: "#f87171", fontSize: 13.5, display: "flex", gap: 8, alignItems: "center" }}>
      <AlertTriangle size={15} /> {err}
    </div>
  );
  if (!cfg) return <div style={{ padding: 24, color: "var(--ink-dim)", fontSize: 13.5 }}>Đang tải…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <Settings size={16} style={{ color: "var(--accent)" }} /> Cấu hình nhóm
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
          Các luật dưới đây chỉ áp dụng cho <strong style={{ color: "var(--ink)" }}>riêng nhóm này</strong>.
          Bot phải là <strong style={{ color: "var(--ink)" }}>quản trị viên hoặc phó nhóm</strong> thì mới xóa được tin.
        </div>
      </div>

      {/* ── Chế độ thử ─────────────────────────────── */}
      <div style={{ ...card, background: cfg.dryRun ? "rgba(251,191,36,.07)" : "rgba(248,113,113,.07)",
                    border: `1px solid ${cfg.dryRun ? "rgba(251,191,36,.35)" : "rgba(248,113,113,.35)"}` }}>
        <Toggle on={cfg.dryRun} color="#fbbf24"
          onChange={v => set({ dryRun: v })}
          label="Chế độ thử — chỉ ghi log, KHÔNG xóa tin thật"
          desc="Bật thì bot chỉ ghi vào tab Log hệ thống những tin nó ĐỊNH xóa, chứ không đụng vào nhóm. Chạy vài ngày, xem log thấy đúng rồi hãy tắt để chạy thật." />
        {!cfg.dryRun && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 9, background: "rgba(248,113,113,.12)",
                        fontSize: 12.5, color: "#f87171", display: "flex", gap: 7, alignItems: "flex-start" }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong>Đang chạy thật.</strong> Tin bị xóa không khôi phục được.</span>
          </div>
        )}
      </div>

      {/* ── Điểm sàn ───────────────────────────────── */}
      <div style={card}>
        <Toggle on={cfg.floorEnabled} onChange={v => set({ floorEnabled: v })}
          label="Điểm sàn mới được nhận cuốc"
          desc="Tắt thì ai cũng nhắn ok nhận cuốc bình thường như hiện nay." />

        {cfg.floorEnabled && (
          <div style={{ marginTop: 16, paddingLeft: 55 }}>
            <label style={{ display: "block", fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>
              Ngưỡng điểm tối thiểu
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <input type="number" step="0.5" value={cfg.floorPoints}
                onChange={e => set({ floorPoints: e.target.value })}
                style={{ ...inp, width: 130, fontFamily: "monospace", fontWeight: 700, fontSize: 15 }} />
              <span style={{ fontSize: 13, color: "var(--ink-dim)" }}>điểm</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 16 }}>
              Thành viên có điểm <strong style={{ color: "var(--ink)" }}>từ {cfg.floorPoints || 0}đ trở lên</strong> mới
              nhận được cuốc. Nhập số âm được, ví dụ <code style={{ background: "rgba(255,255,255,.07)", padding: "1px 5px", borderRadius: 4 }}>-5</code> nghĩa
              là nợ quá 5đ thì bị chặn.
            </div>

            <label style={{ display: "block", fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>
              Tin bot gửi khi chặn
            </label>
            <textarea rows={3} value={cfg.floorNotice} onChange={e => set({ floorNotice: e.target.value })}
              placeholder="Để trống = xóa im lặng, không nhắc gì"
              style={{ ...inp, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
            <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 6, lineHeight: 1.7 }}>
              Dùng được: <code style={{ background: "rgba(52,211,153,.12)", color: "#34d399", padding: "1px 5px", borderRadius: 4 }}>{"{tên}"}</code> (tag tài xế) ·{" "}
              <code style={{ background: "rgba(52,211,153,.12)", color: "#34d399", padding: "1px 5px", borderRadius: 4 }}>{"{ngưỡng}"}</code> ·{" "}
              <code style={{ background: "rgba(52,211,153,.12)", color: "#34d399", padding: "1px 5px", borderRadius: 4 }}>{"{điểm}"}</code> (điểm hiện tại)
            </div>
          </div>
        )}
      </div>

      {/* ── Xóa icon ───────────────────────────────── */}
      <div style={card}>
        <Toggle on={cfg.iconDeleteEnabled} onChange={v => set({ iconDeleteEnabled: v })}
          label="Tự xóa sticker và tin chỉ toàn icon" color="#a78bfa"
          desc="Giữ nhóm sạch, tránh loãng nội dung cuốc xe." />

        {cfg.iconDeleteEnabled && (
          <div style={{ marginTop: 16, paddingLeft: 55 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.25)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#f87171", marginBottom: 6 }}>BỊ XÓA</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.8 }}>
                  · Sticker Zalo<br />· Tin chỉ có 👍 😂 ❤️<br />· Không kèm chữ nào
                </div>
              </div>
              <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(52,211,153,.07)", border: "1px solid rgba(52,211,153,.25)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#34d399", marginBottom: 6 }}>GIỮ NGUYÊN</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.8 }}>
                  · Ảnh, hình chụp<br />· Tin nhắn thoại<br />· "ok 👍" (có chữ)
                </div>
              </div>
            </div>

            <label style={{ display: "block", fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>
              Tin bot gửi khi xóa icon
            </label>
            <textarea rows={2} value={cfg.iconNotice} onChange={e => set({ iconNotice: e.target.value })}
              placeholder="Để trống = xóa im lặng (khuyến nghị, tránh làm loãng nhóm)"
              style={{ ...inp, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }} />
          </div>
        )}
      </div>

      {/* ── Lưu ────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 20 }}>
        <button onClick={save} disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 24px", borderRadius: 10, border: "none",
                   background: "rgba(52,211,153,.2)", color: "var(--accent)", fontWeight: 800, fontSize: 14,
                   cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1 }}>
          <Save size={15} /> {saving ? "Đang lưu…" : "Lưu cấu hình"}
        </button>
        {msg && <span style={{ color: "var(--accent)", fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}><Check size={14} />{msg}</span>}
        {err && <span style={{ color: "#f87171", fontSize: 13 }}>{err}</span>}
      </div>

      {/* ── Lưu ý ──────────────────────────────────── */}
      <div style={{ marginTop: 24, padding: "14px 16px", borderRadius: 12, background: "rgba(96,165,250,.06)",
                    border: "1px solid rgba(96,165,250,.25)", fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.85 }}>
        <div style={{ fontWeight: 800, color: "#60a5fa", marginBottom: 7, display: "flex", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={14} /> Các lớp an toàn đang bật sẵn
        </div>
        · Không bao giờ xóa tin của <strong style={{ color: "var(--ink)" }}>bot và kế toán</strong><br />
        · Chỉ chặn đúng tin <strong style={{ color: "var(--ink)" }}>nhận cuốc thật</strong> (reply trúng tin đăng cuốc) — "ok" trong chat thường không bị đụng<br />
        · Tối đa <strong style={{ color: "var(--ink)" }}>10 tin/phút</strong> mỗi nhóm, tránh Zalo khóa tài khoản bot<br />
        · Mọi lần xóa đều ghi vào <strong style={{ color: "var(--ink)" }}>tab Log hệ thống</strong> để đối chiếu khi tài xế thắc mắc<br />
        · Tin bị xóa vẫn còn trong kho tin thô <strong style={{ color: "var(--ink)" }}>7 ngày</strong> để tra cứu
      </div>
    </div>
  );
}
