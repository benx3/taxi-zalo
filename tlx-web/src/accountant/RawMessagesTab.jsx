import React, { useState, useEffect, useRef } from "react";
import { Search, RefreshCw, MessageSquare, X } from "lucide-react";
import { api } from "./api.js";

const fmtTime = (ms) => new Date(Number(ms)).toLocaleTimeString("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

const todayStr = () => {
  const d = new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
};

// Highlight từ tìm kiếm trong text
function Highlight({ text, q }) {
  if (!q || !text) return <>{text || ""}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return <>{parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} style={{ background: "rgba(251,191,36,.35)", color: "inherit", borderRadius: 2 }}>{p}</mark>
      : p
  )}</>;
}

// Phân loại tin nhắn để hiển thị màu sắc
function classifyMsg(text) {
  if (!text) return "normal";
  const t = text.toLowerCase();
  if (/\bsan\b/.test(t)) return "san";
  if (/(\d+\s*(đ|d|dong|điểm)|\bđ\b)/.test(t)) return "money";
  if (/>>|=>>/.test(t) || /\b(hà nội|hcm|sân bay|sbđ|sbt|sân bay đón|sân bay tiễn)\b/i.test(t)) return "trip";
  return "normal";
}

const MSG_COLORS = {
  san:    { bg: "rgba(96,165,250,.08)",  border: "rgba(96,165,250,.25)",  dot: "#60a5fa"  },
  money:  { bg: "rgba(52,211,153,.07)",  border: "rgba(52,211,153,.22)",  dot: "#34d399"  },
  trip:   { bg: "rgba(251,191,36,.07)",  border: "rgba(251,191,36,.22)",  dot: "#fbbf24"  },
  normal: { bg: "transparent",           border: "transparent",           dot: "#4a5568"  },
};

export default function RawMessagesTab({ groupId }) {
  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [msgs, setMsgs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const bottomRef = useRef(null);

  const load = (d, s) => {
    setLoading(true); setErr("");
    api.rawMessages(groupId, d, s || undefined)
      .then(data => { setMsgs(data); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (groupId) load(date, search); }, [groupId, date]);

  const doSearch = () => { setSearch(searchInput); load(date, searchInput); };
  const clearSearch = () => { setSearchInput(""); setSearch(""); load(date, ""); };

  // Gom tin nhắn theo từng phút để gộp tin liên tiếp cùng người
  const grouped = [];
  if (msgs) {
    let lastSender = null, lastMinute = null;
    for (const m of msgs) {
      const minute = Math.floor(Number(m.created_at) / 60000);
      const key = m.sender_id + "|" + minute;
      if (key !== lastSender + "|" + lastMinute) {
        grouped.push({ ...m, _texts: [m.text], _ids: [m.msg_id] });
        lastSender = m.sender_id; lastMinute = minute;
      } else {
        grouped[grouped.length - 1]._texts.push(m.text);
        grouped[grouped.length - 1]._ids.push(m.msg_id);
      }
    }
  }

  const s = { padding: "20px 0 0" };

  return (
    <div style={s}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13, cursor: "pointer" }}
        />
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-dim)", pointerEvents: "none" }} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Tìm nội dung tin nhắn… (Enter)"
            style={{ width: "100%", padding: "8px 32px 8px 30px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
          />
          {searchInput && (
            <button onClick={clearSearch} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 2 }}>
              <X size={13} />
            </button>
          )}
        </div>
        <button onClick={doSearch} style={{ padding: "8px 16px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#04121a", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          Tìm
        </button>
        <button onClick={() => load(date, search)} style={{ padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "none", color: "var(--ink-dim)", cursor: "pointer" }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, fontSize: 11, color: "var(--ink-dim)", flexWrap: "wrap" }}>
        {[["trip","Cuốc xe"],["san","San điểm"],["money","Có số tiền/điểm"],["normal","Thường"]].map(([type, label]) => (
          <span key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: MSG_COLORS[type].dot, display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>

      {/* Messages */}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-dim)", fontSize: 14 }}>Đang tải…</div>}
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>Lỗi: {err}</div>}

      {!loading && msgs !== null && msgs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--ink-dim)" }}>
          <MessageSquare size={32} style={{ opacity: .3, marginBottom: 10 }} />
          <div style={{ fontSize: 14 }}>Không có tin nhắn nào{search ? ` khớp "${search}"` : ""} ngày {date}.</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: .6 }}>Raw messages được lưu từ lúc service khởi động.</div>
        </div>
      )}

      {!loading && grouped.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {grouped.map((m, i) => {
            const type = classifyMsg(m._texts.join(" "));
            const col = MSG_COLORS[type];
            const isFirst = i === 0 || grouped[i - 1].sender_id !== m.sender_id;
            return (
              <div key={m._ids[0]} style={{ background: col.bg, border: col.border !== "transparent" ? `1px solid ${col.border}` : "none", borderLeft: `3px solid ${col.dot}`, borderRadius: 7, padding: "6px 10px", marginBottom: type !== "normal" ? 2 : 0 }}>
                {isFirst && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{m.sender_name || m.sender_id}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>{fmtTime(m.created_at)}</span>
                  </div>
                )}
                {m._texts.map((txt, j) => txt ? (
                  <div key={j} style={{ fontSize: 13, color: type === "normal" ? "var(--ink-dim)" : "var(--ink)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    <Highlight text={txt} q={search} />
                  </div>
                ) : null)}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Count footer */}
      {!loading && msgs !== null && msgs.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: "var(--ink-dim)", textAlign: "center" }}>
          {msgs.length} tin nhắn ngày {date}{search ? ` · tìm "${search}"` : ""}
          {msgs.length >= 500 && <span style={{ color: "#f59e0b", marginLeft: 6 }}>· Hiển thị tối đa 500 tin</span>}
        </div>
      )}
    </div>
  );
}
