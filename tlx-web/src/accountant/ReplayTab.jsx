import React, { useState } from "react";
import { AlertCircle, CheckCircle2, History, Search, Trash2 } from "lucide-react";
import { api } from "./api.js";

const fmtPts = (v) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); };
const pad2 = (n) => String(n).padStart(2, "0");

// "14:00" + ngày hôm nay → epoch ms (giờ VN của trình duyệt KT)
const todayAt = (hhmm) => {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
};
const fmtClock = (ms) => {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const th = { padding: "8px 10px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "var(--ink-dim)", whiteSpace: "nowrap" };
const td = { padding: "7px 10px", verticalAlign: "middle" };

export default function ReplayTab({ groupId }) {
  const now = new Date();
  const [fromTime, setFromTime] = useState("14:00");
  const [toTime, setToTime] = useState(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState(null);

  const doPreview = async () => {
    setErr(""); setBusy(true); setResult(null);
    try {
      const fromMs = todayAt(fromTime), toMs = todayAt(toTime);
      if (toMs <= fromMs) { setErr("Giờ kết thúc phải sau giờ bắt đầu"); setBusy(false); return; }
      const r = await api.replayPreview(groupId, fromMs, toMs);
      setItems(r.items || []);
      setCoverage(r.coverage || null);
      // Mặc định chọn hết những dòng chưa có trong hệ thống
      setPicked(new Set((r.items || []).filter(i => !i.alreadyExists).map(i => i.id)));
    } catch (e) {
      setErr(e.message || "Lỗi đọc lịch sử");
    } finally { setBusy(false); }
  };

  const doApply = async () => {
    setShowConfirm(false); setBusy(true); setErr("");
    try {
      const sel = items.filter(i => picked.has(i.id));
      const r = await api.replayApply(groupId, sel);
      setResult(r);
      setItems(null); setPicked(new Set());
    } catch (e) {
      setErr("Lỗi ghi điểm: " + e.message);
    } finally { setBusy(false); }
  };

  const toggle = (id) => setPicked(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const removeRow = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    setPicked(prev => { const s = new Set(prev); s.delete(id); return s; });
  };

  const newItems = (items || []).filter(i => !i.alreadyExists);
  const dupItems = (items || []).filter(i => i.alreadyExists);
  const selCount = picked.size;
  const selPts = (items || []).filter(i => picked.has(i.id)).reduce((s, i) => s + (Number(i.points) || 0), 0);

  return (
    <div style={{ padding: "24px" }}>
      {/* ── Header + bộ chọn giờ ─────────────────────────── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <History size={16} style={{ color: "var(--accent)" }} /> Đọc lại tin nhắn & tính điểm bù
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
          Dùng khi bot bỏ sót cuốc trong một khoảng thời gian. Hệ thống đọc lại tin nhắn đã lưu
          <strong style={{ color: "var(--ink)" }}> trong ngày hôm nay</strong>, dựng lại luồng đăng cuốc → nhận → xác nhận,
          rồi cho bạn duyệt trước khi ghi điểm. Tin nhắn được lưu <strong style={{ color: "var(--ink)" }}>7 ngày</strong>,
          dùng chung cho mọi tài khoản bot trong nhóm — bot này chết thì bot kia đã ghi hộ.
        </div>
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "16px 18px", marginBottom: 18, display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>Từ giờ</div>
          <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 14, fontFamily: "monospace" }} />
        </div>
        <div style={{ color: "var(--ink-dim)", paddingBottom: 9 }}>→</div>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>Đến giờ</div>
          <input type="time" value={toTime} onChange={e => setToTime(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontSize: 14, fontFamily: "monospace" }} />
        </div>
        <button onClick={doPreview} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.2)", color: "var(--accent)", fontWeight: 700, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1 }}>
          <Search size={14} /> {busy ? "Đang đọc lịch sử…" : "Xem trước"}
        </button>
      </div>

      {err && (
        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f87171", display: "flex", gap: 8, alignItems: "center" }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />{err}
        </div>
      )}

      {/* ── Kết quả sau khi ghi ──────────────────────────── */}
      {result && (
        <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>
            <CheckCircle2 size={18} style={{ color: "var(--accent)" }} /> Đã ghi điểm bù xong
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.8 }}>
            · Tạo mới <strong style={{ color: "var(--accent)" }}>{result.created}</strong> giao dịch tính điểm<br />
            {result.pending > 0 && <>· Đưa vào chờ duyệt <strong style={{ color: "#fbbf24" }}>{result.pending}</strong> cuốc (thiếu barem / nhiều cuốc trong 1 tin)<br /></>}
            {result.skipped > 0 && <>· Bỏ qua <strong style={{ color: "var(--ink-dim)" }}>{result.skipped}</strong> cuốc đã tính điểm trước đó<br /></>}
            {result.errors?.length > 0 && <span style={{ color: "#f87171" }}>· {result.errors.length} dòng lỗi: {result.errors.map(e => e.error).join("; ")}</span>}
          </div>
        </div>
      )}

      {/* ── Cảnh báo phạm vi lịch sử ─────────────────────── */}
      {coverage && coverage.totalStored === 0 && (
        <div style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#fbbf24", display: "flex", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Chưa có tin nhắn nào được lưu cho nhóm này. Việc lưu tin chỉ bắt đầu từ khi bot chạy phiên bản mới —
            các cuốc trước đó phải dùng tab <strong>Nhập cuốc tay</strong>.
          </span>
        </div>
      )}
      {coverage && coverage.totalStored > 0 && !coverage.covered && (
        <div style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#fbbf24", display: "flex", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Tin lưu sớm nhất của nhóm là <strong>{fmtClock(coverage.oldestMs)}</strong> — chưa lùi tới mốc <strong>{fromTime}</strong> bạn yêu cầu.
            Kết quả dưới đây chỉ tính được phần từ {fmtClock(coverage.oldestMs)} trở đi; phần trước đó dùng tab <strong>Nhập cuốc tay</strong>.
          </span>
        </div>
      )}
      {coverage && coverage.totalStored > 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
          Kho tin nhóm này: <strong style={{ color: "var(--ink)" }}>{coverage.totalStored.toLocaleString()}</strong> tin đã lưu ·
          đọc <strong style={{ color: "var(--ink)" }}>{coverage.fetched}</strong> tin trong khung giờ
        </div>
      )}
      {coverage && !coverage.hasRules && (
        <div style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#fbbf24", display: "flex", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>Nhóm này chưa cấu hình barem — các cuốc sẽ ra 0đ và được đưa vào tab Chờ duyệt để bạn nhập tay.</span>
        </div>
      )}

      {/* ── Bảng xem trước ───────────────────────────────── */}
      {items && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>
              Tìm thấy <strong style={{ color: "var(--ink)" }}>{items.length} cuốc đã chốt</strong>
              {newItems.length > 0 && <> · <span style={{ color: "var(--accent)" }}>{newItems.length} chưa tính điểm</span></>}
              {dupItems.length > 0 && <> · <span style={{ color: "var(--ink-dim)" }}>{dupItems.length} đã có sẵn</span></>}
            </div>
            <div style={{ flex: 1 }} />
            {selCount > 0 && (
              <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>
                Chọn <strong style={{ color: "var(--ink)" }}>{selCount}</strong> · tổng <strong style={{ color: "var(--accent)" }}>{fmtPts(selPts)}đ</strong>
              </div>
            )}
            <button onClick={() => selCount > 0 && setShowConfirm(true)} disabled={busy || selCount === 0}
              style={{ padding: "8px 22px", borderRadius: 9, border: "none", background: selCount ? "rgba(52,211,153,.2)" : "rgba(255,255,255,.06)", color: selCount ? "var(--accent)" : "var(--ink-dim)", fontWeight: 700, fontSize: 14, cursor: selCount ? "pointer" : "default" }}>
              {busy ? "Đang ghi…" : `Ghi điểm (${selCount})`}
            </button>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--card)" }}>
                  <th style={{ ...th, width: 38 }}></th>
                  <th style={{ ...th, width: 54 }}>Giờ</th>
                  <th style={th}>Cuốc xe</th>
                  <th style={th}>Loại / Giá</th>
                  <th style={th}>Chủ cuốc (+)</th>
                  <th style={th}>Người nhận (−)</th>
                  <th style={{ ...th, textAlign: "right" }}>Điểm</th>
                  <th style={th}>Nguồn điểm</th>
                  <th style={{ ...th, width: 38 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={{
                    borderTop: "1px solid var(--line)",
                    background: it.alreadyExists ? "rgba(255,255,255,.02)" : (it.needsRule ? "rgba(251,191,36,.05)" : "transparent"),
                    opacity: it.alreadyExists ? .55 : 1,
                  }}>
                    <td style={{ ...td, textAlign: "center" }}>
                      <input type="checkbox" checked={picked.has(it.id)} onChange={() => toggle(it.id)}
                        disabled={it.alreadyExists} style={{ cursor: it.alreadyExists ? "default" : "pointer", width: 15, height: 15 }} />
                    </td>
                    <td style={{ ...td, fontFamily: "monospace", fontSize: 12, color: "var(--ink-dim)" }}>{it.timeStr?.slice(0, 5)}</td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={it.tripText}>
                        {it.tripText}
                      </div>
                      {it.alreadyExists && <span style={{ fontSize: 11, color: "var(--ink-dim)", fontStyle: "italic" }}>đã tính điểm trước đó</span>}
                      {!it.alreadyExists && it.needsRule && <span style={{ fontSize: 11, color: "#fbbf24" }}>⚠ chưa có barem → vào chờ duyệt</span>}
                      {it.multiTrips && <span style={{ fontSize: 11, color: "#fbbf24" }}> · nhiều cuốc trong 1 tin</span>}
                    </td>
                    <td style={{ ...td, fontSize: 12, whiteSpace: "nowrap" }}>
                      {it.tripType}{it.tripPrice ? <span style={{ color: "var(--ink-dim)" }}> · {it.tripPrice}k</span> : null}
                    </td>
                    <td style={{ ...td, fontSize: 12.5 }}>{it.posterName}</td>
                    <td style={{ ...td, fontSize: 12.5 }}>{it.takerName}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: it.points > 0 ? "var(--accent)" : "var(--ink-dim)" }}>
                      {fmtPts(it.points)}đ
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: "var(--ink-dim)" }}>{it.ptsSrc}</td>
                    <td style={td}>
                      <button onClick={() => removeRow(it.id)} title="Bỏ dòng này khỏi danh sách"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4, display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={9} style={{ ...td, textAlign: "center", color: "var(--ink-dim)", padding: "36px 0" }}>
                    Không tìm thấy cuốc nào đã chốt (có "ok ib") trong khung giờ này
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Modal xác nhận ───────────────────────────────── */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "grid", placeItems: "center", zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: "28px 32px", maxWidth: 420, width: "90%", border: "1px solid var(--line)" }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 12 }}>Xác nhận ghi điểm bù?</div>
            <div style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.8, marginBottom: 22 }}>
              <div>· Ghi <strong style={{ color: "var(--ink)" }}>{selCount}</strong> giao dịch, tổng <strong style={{ color: "var(--accent)" }}>{fmtPts(selPts)}đ</strong></div>
              <div>· Khung giờ <strong style={{ color: "var(--ink)" }}>{fromTime} → {toTime}</strong> hôm nay</div>
              <div style={{ marginTop: 8, color: "#f87171", fontSize: 12 }}>
                Hành động này thay đổi điểm thực của thành viên. Cuốc nào đã tính điểm rồi hệ thống tự bỏ qua, không cộng trùng.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                Hủy
              </button>
              <button onClick={doApply}
                style={{ padding: "8px 22px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.2)", color: "var(--accent)", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                Xác nhận ghi điểm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
