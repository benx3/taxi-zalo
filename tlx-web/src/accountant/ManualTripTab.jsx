import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Zap, AlertCircle, CheckCircle2, PenLine, ArrowRight } from "lucide-react";
import { api } from "./api.js";

const fmtPts = (v) => { const n = Number(v) || 0; return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); };
const pad2 = (n) => String(n).padStart(2, "0");
const nameOf = (m) => m.alias || m.display_name || m.zalo_uid;

const th = { padding: "9px 10px", textAlign: "left", fontWeight: 700, fontSize: 12, color: "var(--ink-dim)", whiteSpace: "nowrap" };
const td = { padding: "8px 10px", verticalAlign: "top" };
const inp = {
  width: "100%", padding: "7px 9px", borderRadius: 8, border: "1px solid var(--line)",
  background: "var(--bg)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box",
};

/* ── Ô chọn thành viên có tìm kiếm ───────────────────────────
   Menu render qua portal ra <body> với position:fixed — vì bảng cha có
   overflow-x:auto (CSS ép trục còn lại thành auto) sẽ cắt mất menu.        */
function MemberPicker({ members, value, onChange, placeholder, exclude }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState(null);
  const trigRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  const selected = members.find(m => m.zalo_uid === value);

  // Tính vị trí menu theo ô bấm; tự lật lên trên nếu dưới không đủ chỗ
  const place = () => {
    const el = trigRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const MENU_H = 272;
    const below = window.innerHeight - r.bottom;
    const up = below < MENU_H && r.top > below;
    setPos({
      left: r.left,
      width: Math.max(r.width, 230),
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxH: Math.max(160, (up ? r.top : below) - 12),
    });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (trigRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onMove = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);   // true: bắt cả cuộn trong bảng
    setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return members
      .filter(m => m.zalo_uid !== exclude)
      .filter(m => !kw || nameOf(m).toLowerCase().includes(kw))
      .slice(0, 80);
  }, [members, q, exclude]);

  const pick = (m) => { onChange(m.zalo_uid, nameOf(m)); setOpen(false); setQ(""); };

  return (
    <>
      <div ref={trigRef} onClick={() => { setQ(""); setOpen(v => !v); }}
        style={{ ...inp, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
                 color: selected ? "var(--ink)" : "var(--ink-dim)", minHeight: 33 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? nameOf(selected) : placeholder}
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-dim)", flexShrink: 0 }}>▾</span>
      </div>

      {open && pos && createPortal(
        <div ref={menuRef}
          style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 9999,
                   background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10,
                   boxShadow: "0 16px 40px rgba(0,0,0,.55)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && list.length) pick(list[0]); }}
            placeholder="Gõ để tìm tên…"
            style={{ ...inp, border: "none", borderBottom: "1px solid var(--line)", borderRadius: 0, flexShrink: 0 }} />
          <div style={{ overflowY: "auto", maxHeight: pos.maxH }}>
            {list.map(m => (
              <div key={m.zalo_uid} onClick={() => pick(m)}
                style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8,
                         background: m.zalo_uid === value ? "rgba(52,211,153,.12)" : "transparent" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.07)"}
                onMouseLeave={e => e.currentTarget.style.background = m.zalo_uid === value ? "rgba(52,211,153,.12)" : "transparent"}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m)}</span>
                <span style={{ color: Number(m.points) >= 0 ? "#34d399" : "#f87171", fontSize: 11, fontFamily: "monospace", flexShrink: 0 }}>
                  {fmtPts(m.points)}đ
                </span>
              </div>
            ))}
            {list.length === 0 && (
              <div style={{ padding: "14px 10px", fontSize: 12.5, color: "var(--ink-dim)", textAlign: "center" }}>
                Không tìm thấy “{q}”
              </div>
            )}
          </div>
        </div>, document.body)}
    </>
  );
}

/* ── Tab chính ───────────────────────────────────────────── */
const blankRow = () => ({
  key: Math.random().toString(36).slice(2),
  posterUid: null, posterName: "", takerUid: null, takerName: "",
  tripText: "", points: "", note: "", parsed: null,
});

export default function ManualTripTab({ groupId }) {
  const now = new Date();
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([blankRow()]);
  const [atTime, setAtTime] = useState(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [noRules, setNoRules] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    api.listMembers(groupId).then(ms => setMembers(ms.filter(m => !m.is_out))).catch(() => {});
  }, [groupId]);

  const upd = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, blankRow()]);
  const delRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : [blankRow()]);

  // Gợi ý điểm theo barem từ nội dung cuốc
  const suggest = async () => {
    const withText = rows.filter(r => r.tripText.trim());
    if (!withText.length) { setErr("Chưa nhập nội dung cuốc nào"); return; }
    setErr(""); setBusy(true);
    try {
      const r = await api.manualSuggest(groupId, rows.map(x => x.tripText || ""));
      setNoRules(!r.hasRules);
      setRows(rs => rs.map((row, i) => {
        const s = r.suggestions[i];
        if (!s || !row.tripText.trim()) return row;
        return { ...row, parsed: s, points: s.points != null ? String(s.points) : row.points };
      }));
    } catch (e) { setErr(e.message || "Lỗi tính điểm"); }
    finally { setBusy(false); }
  };

  // Kiểm tra hợp lệ
  const validate = (r) => {
    if (!r.posterUid && !r.takerUid && !r.tripText.trim() && !r.points) return null; // dòng trống → bỏ qua
    if (!r.posterUid) return "thiếu chủ cuốc";
    if (!r.takerUid) return "thiếu người nhận";
    if (r.posterUid === r.takerUid) return "chủ cuốc trùng người nhận";
    if (r.points === "" || !Number.isFinite(Number(r.points)) || Number(r.points) < 0) return "điểm không hợp lệ";
    return null;
  };
  const isFilled = (r) => r.posterUid || r.takerUid || r.tripText.trim() || r.points !== "";
  const filled = rows.filter(isFilled);
  const problems = filled.map(r => ({ r, msg: validate(r) })).filter(x => x.msg);
  const valid = filled.filter(r => !validate(r));
  const totalPts = valid.reduce((s, r) => s + Number(r.points || 0), 0);

  const doApply = async () => {
    setShowConfirm(false); setBusy(true); setErr("");
    try {
      const [h, m] = atTime.split(":").map(Number);
      const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
      const r = await api.manualApply(groupId, valid.map(x => ({
        posterUid: x.posterUid, posterName: x.posterName,
        takerUid: x.takerUid, takerName: x.takerName,
        points: Number(x.points), tripText: x.tripText, note: x.note,
      })), d.getTime());
      setResult(r);
      setRows([blankRow()]);
      api.listMembers(groupId).then(ms => setMembers(ms.filter(m2 => !m2.is_out))).catch(() => {});
    } catch (e) { setErr("Lỗi ghi điểm: " + e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <PenLine size={16} style={{ color: "var(--accent)" }} /> Thêm cuốc xe thủ công
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6 }}>
          Nhập lại cuốc mà bot bỏ sót. Mỗi dòng là một cuốc đã chốt theo đúng luồng:{" "}
          <strong style={{ color: "var(--ink)" }}>chủ cuốc đăng</strong> → <strong style={{ color: "var(--ink)" }}>người nhận "ok"</strong> → <strong style={{ color: "var(--ink)" }}>chủ cuốc "ok ib"</strong>.
          Chủ cuốc được <span style={{ color: "#34d399" }}>cộng</span> điểm, người nhận bị <span style={{ color: "#f87171" }}>trừ</span> đúng số đó.
        </div>
      </div>

      {/* Thanh công cụ */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 5, fontWeight: 600 }}>Giờ ghi nhận (hôm nay)</div>
          <input type="time" value={atTime} onChange={e => setAtTime(e.target.value)}
            style={{ ...inp, width: 120, fontFamily: "monospace", fontSize: 14 }} />
        </div>
        <button onClick={suggest} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 9, border: "1px solid rgba(251,191,36,.35)",
                   background: "rgba(251,191,36,.1)", color: "#fbbf24", fontWeight: 700, fontSize: 13, cursor: busy ? "default" : "pointer" }}>
          <Zap size={14} /> Tính điểm theo barem
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={addRow}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 9, border: "1px solid var(--line)",
                   background: "transparent", color: "var(--ink-dim)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <Plus size={14} /> Thêm dòng
        </button>
      </div>

      {err && (
        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#f87171", display: "flex", gap: 8, alignItems: "center" }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />{err}
        </div>
      )}
      {noRules && (
        <div style={{ background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.35)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#fbbf24", display: "flex", gap: 8 }}>
          <AlertCircle size={14} style={{ flexShrink: 0 }} />
          <span>Nhóm này chưa cấu hình barem nên không gợi ý được điểm — bạn nhập điểm tay ở cột "Điểm".</span>
        </div>
      )}

      {result && (
        <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 800, fontSize: 15, marginBottom: 6 }}>
            <CheckCircle2 size={18} style={{ color: "var(--accent)" }} /> Đã ghi {result.created} cuốc
          </div>
          {result.errors?.length > 0 && (
            <div style={{ fontSize: 12.5, color: "#f87171", lineHeight: 1.7 }}>
              {result.errors.map(e => <div key={e.row}>· Dòng {e.row}: {e.error}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Bảng nhập */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--line)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 900 }}>
          <thead>
            <tr style={{ background: "var(--card)" }}>
              <th style={{ ...th, width: 34 }}>#</th>
              <th style={{ ...th, minWidth: 165 }}>Chủ cuốc <span style={{ color: "#34d399" }}>(+)</span></th>
              <th style={{ ...th, minWidth: 250 }}>Nội dung cuốc</th>
              <th style={{ ...th, minWidth: 165 }}>Người nhận <span style={{ color: "#f87171" }}>(−)</span></th>
              <th style={{ ...th, width: 96 }}>Điểm</th>
              <th style={{ ...th, minWidth: 130 }}>Ghi chú</th>
              <th style={{ ...th, width: 38 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const problem = isFilled(r) ? validate(r) : null;
              return (
                <tr key={r.key} style={{ borderTop: "1px solid var(--line)", background: problem ? "rgba(248,113,113,.04)" : "transparent" }}>
                  <td style={{ ...td, color: "var(--ink-dim)", textAlign: "center", fontSize: 12, paddingTop: 15 }}>{i + 1}</td>
                  <td style={td}>
                    <MemberPicker members={members} value={r.posterUid} exclude={r.takerUid}
                      placeholder="Chọn chủ cuốc…"
                      onChange={(uid, name) => upd(r.key, { posterUid: uid, posterName: name })} />
                  </td>
                  <td style={td}>
                    <input value={r.tripText} onChange={e => upd(r.key, { tripText: e.target.value, parsed: null })}
                      placeholder="VD: 19h bx7 hà nội >> hải phòng 900k" style={inp} />
                    {r.parsed && (
                      <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        {r.parsed.type ? (
                          <>
                            <span style={{ color: "#60a5fa" }}>{r.parsed.type}</span>
                            {r.parsed.price ? <span>· {r.parsed.price}k</span> : null}
                            <ArrowRight size={10} />
                            <span style={{ color: r.parsed.points ? "#34d399" : "#fbbf24" }}>
                              {r.parsed.points ? `${fmtPts(r.parsed.points)}đ` : "chưa có barem"}
                            </span>
                            {r.parsed.explicit && <span style={{ color: "#fbbf24" }}>(điểm ghi trong tin)</span>}
                          </>
                        ) : <span style={{ color: "#fbbf24" }}>không nhận ra cuốc xe — nhập điểm tay</span>}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    <MemberPicker members={members} value={r.takerUid} exclude={r.posterUid}
                      placeholder="Chọn người nhận…"
                      onChange={(uid, name) => upd(r.key, { takerUid: uid, takerName: name })} />
                  </td>
                  <td style={td}>
                    <input type="number" step="0.5" min="0" value={r.points}
                      onChange={e => upd(r.key, { points: e.target.value })} placeholder="0"
                      style={{ ...inp, textAlign: "right", fontFamily: "monospace", fontWeight: 700 }} />
                  </td>
                  <td style={td}>
                    <input value={r.note} onChange={e => upd(r.key, { note: e.target.value })}
                      placeholder="tuỳ chọn…" style={{ ...inp, fontSize: 12 }} />
                  </td>
                  <td style={{ ...td, paddingTop: 13 }}>
                    <button onClick={() => delRow(r.key)} title="Xoá dòng"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4, display: "flex" }}
                      onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                      onMouseLeave={e => e.currentTarget.style.color = "var(--ink-dim)"}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Lỗi từng dòng */}
      {problems.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "#f87171", lineHeight: 1.7 }}>
          {problems.map(({ r, msg }) => (
            <div key={r.key}>· Dòng {rows.findIndex(x => x.key === r.key) + 1}: {msg}</div>
          ))}
        </div>
      )}

      {/* Chân trang: tổng + nút ghi */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>
          Hợp lệ: <strong style={{ color: "var(--ink)" }}>{valid.length} cuốc</strong>
          {valid.length > 0 && <> · tổng <strong style={{ color: "var(--accent)" }}>{fmtPts(totalPts)}đ</strong></>}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => valid.length > 0 && setShowConfirm(true)} disabled={busy || valid.length === 0}
          style={{ padding: "9px 24px", borderRadius: 9, border: "none",
                   background: valid.length ? "rgba(52,211,153,.2)" : "rgba(255,255,255,.06)",
                   color: valid.length ? "var(--accent)" : "var(--ink-dim)",
                   fontWeight: 700, fontSize: 14, cursor: valid.length ? "pointer" : "default" }}>
          {busy ? "Đang ghi…" : `Ghi điểm (${valid.length})`}
        </button>
      </div>

      {/* Modal xác nhận */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.65)", display: "grid", placeItems: "center", zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: "26px 30px", maxWidth: 460, width: "90%", border: "1px solid var(--line)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 14 }}>Xác nhận ghi {valid.length} cuốc?</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.9, marginBottom: 16 }}>
              {valid.map((r, i) => (
                <div key={r.key} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                  <span style={{ opacity: .6 }}>{i + 1}.</span>
                  <span style={{ color: "#34d399" }}>{r.posterName}</span>
                  <span>+{fmtPts(r.points)}đ</span>
                  <ArrowRight size={11} style={{ flexShrink: 0 }} />
                  <span style={{ color: "#f87171" }}>{r.takerName}</span>
                  <span>−{fmtPts(r.points)}đ</span>
                </div>
              ))}
            </div>
            <div style={{ color: "#f87171", fontSize: 12, marginBottom: 20 }}>
              Hành động này thay đổi điểm thực của thành viên, ghi vào lịch sử giao dịch với nhãn "Nhập tay".
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
