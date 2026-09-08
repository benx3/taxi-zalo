import React, { useState, useEffect, useRef, useCallback } from "react";
import { AlertCircle, AlertTriangle, Info, RefreshCw, Search, Trash2, Play, Pause, Copy, Check } from "lucide-react";
import { api } from "./api.js";

const pad2 = (n) => String(n).padStart(2, "0");
const fmtTime = (ts) => {
  const d = new Date(ts);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const hhmmss = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return d.getTime() >= today.getTime() ? hhmmss : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${hhmmss}`;
};

const LEVELS = {
  error: { label: "Lỗi",       color: "#f87171", bg: "rgba(248,113,113,.09)", Icon: AlertCircle },
  warn:  { label: "Cảnh báo",  color: "#fbbf24", bg: "rgba(251,191,36,.08)",  Icon: AlertTriangle },
  info:  { label: "Thông tin", color: "#60a5fa", bg: "transparent",           Icon: Info },
};

const FILTERS = [
  { key: "problem", label: "Lỗi + Cảnh báo" },
  { key: "error",   label: "Chỉ lỗi" },
  { key: "warn",    label: "Chỉ cảnh báo" },
  { key: "all",     label: "Tất cả" },
];

export default function LogsTab({ cardStyle }) {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [level, setLevel] = useState("problem");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("live");
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      const r = await api.getLogs({ level, search, limit: 400, source });
      setEntries(r.entries || []);
      setStats(r.stats || null);
      setErr("");
    } catch (e) { setErr(e.message || "Không tải được log"); }
    finally { if (!silent) setBusy(false); }
  }, [level, search, source]);

  useEffect(() => { load(); }, [load]);

  // Tự làm mới 5 giây/lần khi xem log đang chạy
  useEffect(() => {
    clearInterval(timerRef.current);
    if (auto && source === "live") timerRef.current = setInterval(() => load(true), 5000);
    return () => clearInterval(timerRef.current);
  }, [auto, source, load]);

  const copyAll = () => {
    const txt = entries.map(e => `[${fmtTime(e.ts)}] ${e.level.toUpperCase()} ${e.source ? "[" + e.source + "] " : ""}${e.message}`).join("\n");
    navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const clearSaved = async () => {
    if (!confirm("Xoá toàn bộ log đã lưu trong CSDL?")) return;
    try { await api.clearLogs(); load(); } catch (e) { setErr(e.message); }
  };

  const btn = (active) => ({
    padding: "6px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: active ? "1px solid rgba(52,211,153,.45)" : "1px solid var(--line)",
    background: active ? "rgba(52,211,153,.14)" : "transparent",
    color: active ? "var(--accent)" : "var(--ink-dim)",
  });

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, height: "100%", boxSizing: "border-box" }}>
      {/* Tóm tắt */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
          {[
            { v: stats.errors1h, l: "Lỗi trong 1 giờ", c: "#f87171" },
            { v: stats.warns1h,  l: "Cảnh báo 1 giờ",  c: "#fbbf24" },
            { v: stats.errors,   l: "Tổng lỗi",        c: "#f87171" },
            { v: stats.total,    l: "Dòng log đang giữ", c: "#60a5fa" },
          ].map(s => (
            <div key={s.l} style={{ ...cardStyle, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontWeight: 800, fontSize: 22, color: s.c }}>{s.v ?? 0}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* Thanh điều khiển */}
      <div style={{ ...cardStyle, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setLevel(f.key)} style={btn(level === f.key)}>{f.label}</button>
          ))}
        </div>

        <div style={{ width: 1, height: 22, background: "var(--line)" }} />

        <button onClick={() => setSource("live")} style={btn(source === "live")} title="Log của tiến trình đang chạy, mất khi restart">
          Đang chạy
        </button>
        <button onClick={() => setSource("saved")} style={btn(source === "saved")} title="Lỗi/cảnh báo lưu trong CSDL, còn sau restart">
          Đã lưu (7 ngày)
        </button>

        <div style={{ position: "relative", flex: 1, minWidth: 170 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)" }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm trong log…"
            style={{ width: "100%", padding: "7px 9px 7px 28px", borderRadius: 8, border: "1px solid var(--line)",
                     background: "var(--bg)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box" }} />
        </div>

        {source === "live" && (
          <button onClick={() => setAuto(v => !v)} style={btn(auto)} title="Tự làm mới mỗi 5 giây">
            {auto ? <Pause size={12} /> : <Play size={12} />} {auto ? "Đang theo dõi" : "Đã dừng"}
          </button>
        )}
        <button onClick={() => load()} disabled={busy} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 5 }}>
          <RefreshCw size={12} /> {busy ? "Đang tải…" : "Tải lại"}
        </button>
        <button onClick={copyAll} style={{ ...btn(false), display: "flex", alignItems: "center", gap: 5 }} title="Chép toàn bộ log đang hiện">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Đã chép" : "Chép"}
        </button>
        {source === "saved" && (
          <button onClick={clearSaved}
            style={{ ...btn(false), color: "#f87171", borderColor: "#f8717144", display: "flex", alignItems: "center", gap: 5 }}>
            <Trash2 size={12} /> Xoá log đã lưu
          </button>
        )}
      </div>

      {err && (
        <div style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.3)", borderRadius: 8,
                      padding: "10px 14px", fontSize: 13, color: "#f87171", display: "flex", gap: 8, alignItems: "center" }}>
          <AlertCircle size={14} />{err}
        </div>
      )}

      {/* Danh sách log */}
      <div style={{ ...cardStyle, flex: 1, minHeight: 260, overflowY: "auto", padding: 0 }}>
        {entries.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--ink-dim)", fontSize: 13.5 }}>
            {busy ? "Đang tải…" : level === "problem" || level === "error"
              ? "🎉 Không có lỗi nào — hệ thống đang chạy sạch"
              : "Không có dòng log nào khớp"}
          </div>
        ) : entries.map(e => {
          const L = LEVELS[e.level] || LEVELS.info;
          return (
            <div key={`${e.id}-${e.ts}`}
              style={{ display: "flex", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--line)",
                       background: L.bg, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.55 }}>
              <L.Icon size={13} style={{ color: L.color, flexShrink: 0, marginTop: 3 }} />
              <span style={{ color: "var(--ink-dim)", fontFamily: "monospace", fontSize: 11.5, flexShrink: 0, minWidth: 62 }}>
                {fmtTime(e.ts)}
              </span>
              {e.source && (
                <span style={{ color: "#a78bfa", fontSize: 11, background: "rgba(167,139,250,.1)", padding: "1px 6px",
                               borderRadius: 5, flexShrink: 0, maxWidth: 150, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.source}>
                  {e.source}
                </span>
              )}
              <span style={{ color: e.level === "info" ? "var(--ink-dim)" : "var(--ink)", whiteSpace: "pre-wrap",
                             wordBreak: "break-word", flex: 1, fontFamily: "monospace", fontSize: 12 }}>
                {e.message}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>
        {source === "live"
          ? "Log của tiến trình đang chạy (giữ 1.500 dòng gần nhất trong RAM) — mất khi restart worker."
          : "Lỗi và cảnh báo lưu trong CSDL, giữ 7 ngày — vẫn còn sau khi restart worker."}
      </div>
    </div>
  );
}
