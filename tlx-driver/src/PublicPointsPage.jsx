import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, ArrowLeft, Users, ChevronRight, Clock, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";

const BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8080";
const get = async (path) => {
  const r = await fetch(BASE + path);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text.startsWith("<") ? `Lỗi ${r.status} — restart tlx-driver-service` : (text || `HTTP ${r.status}`));
  }
  return r.json();
};

const fmtTime = (ms) => {
  const d = new Date(Number(ms));
  if (!ms || isNaN(d.getTime())) return "—";
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const fmtDay = (ms) => {
  const d = new Date(Number(ms));
  if (!ms || isNaN(d.getTime())) return "Không rõ ngày";
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
};
const dayKey = (ms) => {
  const d = new Date(Number(ms));
  if (!ms || isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
};

function yesterdayLabel() {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const d = new Date(Date.now() + vnOffsetMs - 86400000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy} 23:59'`;
}

const PAGE_SIZE = 20;
function buildPageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (cur <= 4) return [1, 2, 3, 4, 5, "…", total];
  if (cur >= total - 3) return [1, "…", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "…", cur - 1, cur, cur + 1, "…", total];
}

/* ── Shared styles ─────────────────────────────── */
const c = {
  bg: "#070b16", card: "#0f1525", border: "#1e2740",
  ink: "#e2e8f0", dim: "#8794ad", accent: "#34d399", blue: "#58a6ff",
};

const noMark = (s) => (s || "").toLowerCase()
  .replace(/đ/gi, "d")
  .normalize("NFD")
  .replace(/\p{Mn}/gu, "");

const slugify = (name) =>
  (name || "")
    .replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const getSlugFromUrl = () => {
  const p = window.location.pathname;
  if (p.startsWith("/xem-diem/")) return decodeURIComponent(p.slice("/xem-diem/".length));
  return null;
};

// Cập nhật đồng bộ title + description + canonical + OG tags
function setSeo({ title, desc, canonical }) {
  document.title = title;
  const setMeta = (name, val) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
    el.setAttribute("content", val);
  };
  const setOg = (prop, val) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
    el.setAttribute("content", val);
  };
  const setTw = (name, val) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
    el.setAttribute("content", val);
  };
  const setLink = (rel, val) => {
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) { el = document.createElement("link"); el.rel = rel; document.head.appendChild(el); }
    el.href = val;
  };
  setMeta("description", desc);
  setOg("og:title", title);
  setOg("og:description", desc);
  setOg("og:url", canonical);
  setTw("twitter:title", title);
  setTw("twitter:description", desc);
  setLink("canonical", canonical);
}

const AVT_COLORS = ["#1e3a5f","#1a2e1a","#2a1a2a","#2a2a1a","#1a2a2a"];
function ZaloAvatar({ uid, name, src, size = 40 }) {
  const [imgErr, setImgErr] = useState(false);
  const bg = AVT_COLORS[(uid || "").charCodeAt(0) % AVT_COLORS.length];
  const initial = (name || "?")[0].toUpperCase();
  const fontSize = size >= 50 ? 22 : 16;
  if (src && !imgErr) {
    return (
      <img
        src={src}
        alt={name || uid}
        onError={() => setImgErr(true)}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: bg }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, display: "grid", placeItems: "center", fontSize, fontWeight: 700, flexShrink: 0, color: "#e2e8f0" }}>
      {initial}
    </div>
  );
}

/* ── Nav & Footer (same as HomePage) ──────────── */
function SiteNav() {
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(7,11,22,.9)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${c.border}` }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 9, marginRight: "auto", textDecoration: "none" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#34d399,#06b6d4)", display: "grid", placeItems: "center", boxShadow: "0 0 16px rgba(52,211,153,.4)", flexShrink: 0 }}>
            <span style={{ fontSize: 18 }}>🚖</span>
          </div>
          <span style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 800, fontSize: 17, letterSpacing: "-.02em", color: c.ink }}>
            Trợ Lý Tài Xế <span style={{ color: c.accent }}>AI</span>
          </span>
        </a>
        <a href="/tinh-diem-tai-xe-zalo" style={{ padding: "8px 14px", borderRadius: 9, background: "rgba(88,166,255,.12)", color: c.blue, fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>
          Tra cứu điểm
        </a>
        <a href="/?screen=login" style={{ padding: "8px 18px", borderRadius: 9, border: `1px solid ${c.border}`, background: "transparent", color: c.dim, fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>
          Đăng nhập
        </a>
        <a href="/?screen=register" style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: "rgba(52,211,153,.15)", color: c.accent, fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>
          Đăng ký
        </a>
      </div>
    </nav>
  );
}

function SiteFooter() {
  return (
    <footer style={{ borderTop: `1px solid ${c.border}`, padding: "28px 20px", textAlign: "center", marginTop: 60 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: "linear-gradient(135deg,#34d399,#06b6d4)", display: "grid", placeItems: "center" }}>
          <span style={{ fontSize: 14 }}>🚖</span>
        </div>
        <span style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 700, fontSize: 14, color: c.dim }}>Trợ Lý Tài Xế AI</span>
      </div>
      <p style={{ fontSize: 12.5, color: "#4a5568", margin: 0 }}>
        © {new Date().getFullYear()} Trợ Lý Tài Xế AI · Quản lý cuốc xe & điểm thưởng thông minh
      </p>
    </footer>
  );
}

/* ── ConvoThread (parse raw_text JSON như kế toán) ─ */
function ConvoThread({ raw }) {
  const [showLog, setShowLog] = useState(false);
  let c2 = null;
  try { c2 = typeof raw === "string" ? JSON.parse(raw) : null; } catch {}
  const fmtTs = (ts) => ts ? new Date(Number(ts)).toLocaleTimeString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit",
  }) : "";
  const row = (time, name, msg, color) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 3 }}>
      <span style={{ fontSize: 11, color: c.dim, whiteSpace: "nowrap", paddingTop: 1 }}>{time}</span>
      <span style={{ fontSize: 12, color: color || c.dim }}><b style={{ color: c.ink, marginRight: 4 }}>{name}:</b>{msg}</span>
    </div>
  );
  if (c2?.tripText) {
    const logItems = Array.isArray(c2.rawLog) ? c2.rawLog : [];
    return (
      <div style={{ background: "rgba(0,0,0,.3)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, lineHeight: 1.5 }}>
        {row(c2.tripTime, c2.tripPoster, c2.tripText, null)}
        {c2.claimText   && row(c2.claimTime,   c2.claimer,       c2.claimText,   "#60a5fa")}
        {c2.confirmText && row(c2.confirmTime,  c2.confirmPoster, c2.confirmText, "#34d399")}
        {c2.cancelText  && row(c2.cancelTime,   c2.canceller,     c2.cancelText,  "#f87171")}
        {logItems.length > 0 && (
          <div style={{ marginTop: 6, borderTop: `1px solid ${c.border}`, paddingTop: 5 }}>
            <button onClick={() => setShowLog(v => !v)}
              style={{ fontSize: 11, color: c.dim, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showLog ? "▲ Ẩn chat log" : `▼ Chat log (${logItems.length} tin)`}
            </button>
            {showLog && (
              <div style={{ marginTop: 4, maxHeight: 220, overflowY: "auto" }}>
                {logItems.map((m, i) => row(fmtTs(m.ts), m.name, m.text, null))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if (raw) {
    const short = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
    return (
      <div style={{ background: "rgba(0,0,0,.2)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "7px 10px", marginBottom: 6, fontSize: 13, color: c.dim, wordBreak: "break-word" }}>
        {short}
      </div>
    );
  }
  return null;
}

/* ── TxRow ─────────────────────────────────────── */
function TxRow({ tx, memberUid }) {
  const pts = Number(tx.points);
  const ptsStr = pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2);
  const isSelf = tx.to_member === memberUid;
  const delta = isSelf ? pts : -pts;
  const receiver = tx.to_member_name || tx.to_member || "";
  const sender   = tx.from_member_name || tx.from_member || "";
  const typeLabel = tx.type === "barem" ? "barem" : tx.type === "san" ? "san điểm" : tx.type === "auto" ? "tự động" : "thủ công";
  const typeBg = tx.type === "barem" ? "rgba(52,211,153,.12)" : tx.type === "san" ? "rgba(88,166,255,.12)" : "rgba(255,255,255,.06)";
  const typeColor = tx.type === "barem" ? "#34d399" : tx.type === "san" ? "#58a6ff" : c.dim;

  return (
    <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12, padding: "13px 15px", marginBottom: 10 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          {receiver
            ? <span style={{ fontWeight: 700, fontSize: 14, color: "#34d399" }}>{receiver} nhận</span>
            : <span style={{ fontWeight: 700, fontSize: 14, color: c.ink }}>Điều chỉnh</span>
          }
          {sender && receiver && (
            <span style={{ fontSize: 13, color: c.dim, marginLeft: 6 }}>← {sender}</span>
          )}
        </div>
        <span style={{ fontWeight: 800, fontSize: 17, color: delta >= 0 ? "#34d399" : "#f87171" }}>
          {delta >= 0 ? "+" : ""}{ptsStr}đ
        </span>
      </div>

      {/* Conversation / raw text */}
      {tx.raw_text && <ConvoThread raw={tx.raw_text} />}
      {tx.reason && !tx.raw_text && (
        <div style={{ fontSize: 13, color: c.dim, lineHeight: 1.5, marginBottom: 8, wordBreak: "break-word" }}>
          {tx.reason.length > 120 ? tx.reason.slice(0, 120) + "…" : tx.reason}
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: typeBg, color: typeColor, fontWeight: 700 }}>
          {typeLabel}
        </span>
        <span style={{ fontSize: 11, color: c.dim, display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
          <Clock size={10} /> {fmtTime(tx.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ── GroupsView ─────────────────────────────────── */
function GroupsView({ onSelect }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    get("/api/public/groups").then(setGroups).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 16px 0" }}>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <h1 style={{ fontFamily: "'Plus Jakarta Sans',system-ui", fontWeight: 800, fontSize: 28, margin: "0 0 8px", color: c.ink }}>Tra Cứu Điểm Tài Xế Zalo</h1>
        <p style={{ color: c.dim, fontSize: 15 }}>Xem bảng xếp hạng điểm barem, lịch sử giao dịch và điểm thưởng tài xế theo nhóm Zalo</p>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: c.dim }}>Đang tải…</div>}
      {err && <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>Lỗi: {err}</div>}
      {!loading && !err && !groups.length && (
        <div style={{ textAlign: "center", padding: 60, color: c.dim }}>Chưa có nhóm nào.</div>
      )}

      {groups.map(g => {
        const slug = g.slug || slugify(g.group_name);
        return (
          <a key={g.group_id} href={`/xem-diem/${slug}`}
            style={{ display: "flex", alignItems: "center", gap: 16, background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 12, cursor: "pointer", transition: "border-color .15s", textDecoration: "none" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = c.blue}
            onMouseLeave={e => e.currentTarget.style.borderColor = c.border}
            onClick={e => { e.preventDefault(); onSelect(g, slug); }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: "rgba(88,166,255,.12)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Users size={22} color={c.blue} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: c.ink }}>{g.group_name || g.group_id}</div>
              <div style={{ fontSize: 12, color: c.dim, marginTop: 2 }}>Nhóm tài xế · Xem điểm thành viên</div>
            </div>
            <ChevronRight size={20} color={c.dim} />
          </a>
        );
      })}
    </div>
  );
}

const MEMBER_PAGE_SIZES = [50, 100, 150];

/* ── MembersView ────────────────────────────────── */
function MembersView({ group, onBack, onSelect }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("points");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/xem-diem/${group.slug || slugify(group.group_name)}`;
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  useEffect(() => {
    get(`/api/public/members/${group.group_id}`).then(setMembers).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [group.group_id]);

  const sorted = useMemo(() => {
    const q = noMark(search.trim());
    let list = q ? members.filter(m =>
      noMark(m.alias).includes(q) ||
      noMark(m.display_name).includes(q) ||
      (m.zalo_uid || "").includes(search.trim())
    ) : [...members];
    list.sort((a, b) => {
      if (sortBy === "points") {
        const d = (Number(b.points) || 0) - (Number(a.points) || 0);
        return sortDir === "asc" ? -d : d;
      }
      const d = (a.display_name || "").localeCompare(b.display_name || "", "vi");
      return sortDir === "desc" ? -d : d;
    });
    return list;
  }, [members, search, sortBy, sortDir]);

  // Reset trang khi search/sort thay đổi
  useEffect(() => { setPage(1); }, [search, sortBy, sortDir, pageSize]);

  const totalPages = Math.ceil(Math.max(sorted.length, 1) / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir(col === "points" ? "desc" : "asc"); }
  };

  // Offset thứ tự (#) theo trang
  const rankOffset = (page - 1) * pageSize;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 16px 0" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: c.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 14, padding: 0 }}>
        <ArrowLeft size={16} /> Danh sách nhóm
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: c.ink, margin: 0 }}>Điểm tài xế {group.group_name || group.group_id}</h1>
            <p style={{ color: c.dim, fontSize: 14, marginTop: 4 }}>Bảng xếp hạng điểm thưởng · {members.length} tài xế</p>
          </div>
          <button onClick={copyLink} style={{ flexShrink: 0, marginTop: 4, padding: "7px 14px", borderRadius: 9, border: `1px solid ${c.border}`, background: copied ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.05)", color: copied ? c.accent : c.dim, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, transition: "all .15s" }}>
            {copied ? "✓ Đã sao chép!" : "🔗 Chia sẻ"}
          </button>
        </div>
      </div>

      {/* Search + Sort + Page size */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={15} color={c.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.card, color: c.ink, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            placeholder="Tìm theo tên tài xế…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["points","Điểm"],["name","Tên"]].map(([col, label]) => (
            <button key={col} onClick={() => toggleSort(col)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: sortBy === col ? c.blue : "#21262d", color: sortBy === col ? "#0d1117" : c.dim }}>
              {label} {sortBy === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
            </button>
          ))}
        </div>
        {/* Page size selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {MEMBER_PAGE_SIZES.map(n => (
            <button key={n} onClick={() => setPageSize(n)}
              style={{ padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: pageSize === n ? "rgba(52,211,153,.2)" : "#21262d", color: pageSize === n ? c.accent : c.dim }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: c.dim }}>Đang tải…</div>}
      {err && <div style={{ color: "#f87171", marginBottom: 12 }}>Lỗi: {err}</div>}

      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 96px 96px 20px", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${c.border}`, fontSize: 11, color: c.dim, fontWeight: 700 }}>
          <div /><div>Tên Zalo</div>
          <div style={{ textAlign: "right", lineHeight: 1.3 }}>{yesterdayLabel()}</div>
          <div style={{ textAlign: "right" }}>Điểm hiện giờ</div>
          <div />
        </div>

        {paged.map((m, i) => {
          const pts = Number(m.points) || 0;
          const ptsYest = Number(m.points_yesterday) ?? pts;
          const fmtPts = (v) => `${v >= 0 ? "+" : ""}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}đ`;
          const rank = rankOffset + i + 1;
          return (
            <div key={m.zalo_uid}
              style={{ display: "grid", gridTemplateColumns: "48px 1fr 96px 96px 20px", gap: 8, padding: "13px 16px", borderBottom: i < paged.length - 1 ? `1px solid ${c.border}` : "none", cursor: "pointer", alignItems: "center", transition: "background .1s" }}
              onMouseEnter={e => e.currentTarget.style.background = "#1c2128"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              onClick={() => onSelect(m)}>
              <ZaloAvatar uid={m.zalo_uid} name={m.display_name} src={m.avatar} size={40} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: c.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.alias || m.display_name || m.zalo_uid}
                </div>
                {m.alias && <div style={{ fontSize: 11, color: c.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.display_name}</div>}
                <div style={{ fontSize: 11, color: c.dim, marginTop: 1 }}>#{rank} · ID …{(m.zalo_uid || "").slice(-6)}</div>
              </div>
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14, color: ptsYest >= 0 ? "#94a3b8" : "#f87171" }}>
                {fmtPts(ptsYest)}
              </div>
              <div style={{ textAlign: "right", fontWeight: 800, fontSize: 16, color: pts >= 0 ? "#34d399" : "#f87171" }}>
                {fmtPts(pts)}
              </div>
              <ChevronRight size={15} color={c.dim} />
            </div>
          );
        })}

        {!loading && sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: c.dim }}>Không tìm thấy.</div>
        )}
      </div>

      {/* Phân trang thành viên */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "16px 0 0", flexWrap: "wrap" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === 1 ? c.dim : c.ink, cursor: page === 1 ? "default" : "pointer", fontSize: 14 }}>‹</button>
          {buildPageList(page, totalPages).map((p, idx) =>
            p === "…"
              ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: c.dim }}>…</span>
              : <button key={p} onClick={() => setPage(p)}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid", borderColor: p === page ? c.accent : c.border, background: p === page ? "rgba(52,211,153,.15)" : "transparent", color: p === page ? c.accent : c.ink, fontWeight: p === page ? 800 : 400, fontSize: 14, cursor: "pointer" }}>
                  {p}
                </button>
          )}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === totalPages ? c.dim : c.ink, cursor: page === totalPages ? "default" : "pointer", fontSize: 14 }}>›</button>
          <span style={{ fontSize: 12, color: c.dim, marginLeft: 6 }}>
            {sorted.length} thành viên · trang {page}/{totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── TransactionsView ───────────────────────────── */
function TransactionsView({ group, member, onBack }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    get(`/api/public/transactions/${group.group_id}/${member.zalo_uid}?limit=200`)
      .then(data => { setTxs(data); setPage(1); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [group.group_id, member.zalo_uid]);

  const pts = Number(member.points) || 0;

  // Phân trang
  const totalPages = Math.ceil(Math.max(txs.length, 1) / PAGE_SIZE);
  const paged = txs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Gom nhóm theo ngày
  const grouped = useMemo(() => {
    const groups = [];
    let curDay = null;
    for (const tx of paged) {
      const dk = dayKey(tx.created_at);
      if (dk !== curDay) {
        curDay = dk;
        groups.push({ type: "date", label: fmtDay(tx.created_at), key: dk });
      }
      groups.push({ type: "tx", tx });
    }
    return groups;
  }, [paged]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px 0" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: c.blue, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, marginBottom: 20, fontSize: 14, padding: 0 }}>
        <ArrowLeft size={16} /> {group.group_name || group.group_id}
      </button>

      {/* Member summary */}
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16, padding: "20px 24px", marginBottom: 28, display: "flex", alignItems: "center", gap: 18 }}>
        <ZaloAvatar uid={member.zalo_uid} name={member.display_name} src={member.avatar} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: c.ink }}>
            {member.alias || member.display_name || member.zalo_uid}
          </div>
          {member.alias && <div style={{ fontSize: 13, color: c.dim, marginTop: 1 }}>{member.display_name}</div>}
          <div style={{ fontSize: 12, color: c.dim, marginTop: 3 }}>{group.group_name} · ID …{(member.zalo_uid || "").slice(-6)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: pts >= 0 ? "#34d399" : "#f87171" }}>
            {pts >= 0 ? "+" : ""}{pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2)}đ
          </div>
          <div style={{ fontSize: 12, color: c.dim, marginTop: 3 }}>Điểm hiện tại</div>
        </div>
      </div>

      {/* Tiêu đề */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: c.ink, margin: 0 }}>
          Lịch sử giao dịch <span style={{ color: c.dim, fontWeight: 500, fontSize: 14 }}>({txs.length})</span>
        </h3>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: c.dim }}>Đang tải…</div>}
      {err && <div style={{ color: "#f87171", marginBottom: 12 }}>Lỗi: {err}</div>}
      {!loading && txs.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: c.dim, fontSize: 15 }}>Chưa có giao dịch nào.</div>
      )}

      {/* Grouped transactions */}
      {grouped.map((item, idx) => {
        if (item.type === "date") {
          return (
            <div key={item.key + idx} style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0 12px" }}>
              <div style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: c.dim, whiteSpace: "nowrap", padding: "4px 10px", background: c.card, border: `1px solid ${c.border}`, borderRadius: 20 }}>
                {item.label}
              </span>
              <div style={{ flex: 1, height: 1, background: c.border }} />
            </div>
          );
        }
        return <TxRow key={item.tx.id} tx={item.tx} memberUid={member.zalo_uid} />;
      })}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "20px 0 0", flexWrap: "wrap" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === 1 ? c.dim : c.ink, cursor: page === 1 ? "default" : "pointer", fontSize: 14 }}>‹</button>
          {buildPageList(page, totalPages).map((p, idx) =>
            p === "…"
              ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: c.dim }}>…</span>
              : <button key={p} onClick={() => setPage(p)}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid", borderColor: p === page ? c.accent : c.border, background: p === page ? "rgba(52,211,153,.15)" : "transparent", color: p === page ? c.accent : c.ink, fontWeight: p === page ? 800 : 400, fontSize: 14, cursor: "pointer" }}>
                  {p}
                </button>
          )}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === totalPages ? c.dim : c.ink, cursor: page === totalPages ? "default" : "pointer", fontSize: 14 }}>›</button>
          <span style={{ fontSize: 12, color: c.dim, marginLeft: 6 }}>{txs.length} giao dịch · trang {page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}

/* ── Root ───────────────────────────────────────── */
export default function PublicPointsPage() {
  const [view, setView] = useState("groups");
  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [slugLoading, setSlugLoading] = useState(false);

  // SEO: cập nhật title/desc/canonical/OG theo từng view
  useEffect(() => {
    const origin = window.location.origin;
    const gName = group?.group_name || group?.group_id || "";
    const gSlug = group ? (group.slug || slugify(gName)) : "";
    const mName = member ? (member.alias || member.display_name || member.zalo_uid || "") : "";

    if (!group || view === "groups") {
      setSeo({
        title: "Tra Cứu Điểm Tài Xế Zalo — Bảng Xếp Hạng & Điểm Thưởng Nhóm Xe",
        desc: "Tra cứu điểm thưởng tài xế Zalo theo nhóm. Xem bảng xếp hạng điểm barem, lịch sử giao dịch và thứ hạng tài xế trong nhóm xe.",
        canonical: `${origin}/tinh-diem-tai-xe-zalo`,
      });
    } else if (view === "members") {
      setSeo({
        title: `Điểm Tài Xế ${gName} — Bảng Xếp Hạng & Điểm Thưởng Zalo`,
        desc: `Xem điểm thưởng tài xế nhóm ${gName} trên Zalo. Bảng xếp hạng điểm barem, lịch sử giao dịch và thứ hạng tài xế cập nhật theo thời gian thực.`,
        canonical: `${origin}/xem-diem/${gSlug}`,
      });
    } else if (view === "transactions") {
      setSeo({
        title: `${mName} — Lịch Sử Điểm Thưởng Nhóm ${gName} | Tra Cứu Điểm Tài Xế Zalo`,
        desc: `Chi tiết lịch sử điểm thưởng của tài xế ${mName} trong nhóm ${gName}. Xem giao dịch điểm barem, san điểm và điểm tích lũy Zalo.`,
        canonical: `${origin}/xem-diem/${gSlug}`,
      });
    }
  }, [view, group, member]);

  // URL routing: load nhóm từ slug + popstate
  useEffect(() => {
    // Nếu URL là /xem-diem/:slug → load nhóm trực tiếp
    const slug = getSlugFromUrl();
    if (slug) {
      setSlugLoading(true);
      get(`/api/public/by-slug/${encodeURIComponent(slug)}`)
        .then(g => { setGroup(g); setView("members"); })
        .catch(() => {})
        .finally(() => setSlugLoading(false));
    }

    // Browser back/forward button
    const onPop = () => {
      const s = getSlugFromUrl();
      if (s) {
        setSlugLoading(true);
        get(`/api/public/by-slug/${encodeURIComponent(s)}`)
          .then(g => { setGroup(g); setMember(null); setView("members"); })
          .catch(() => { setGroup(null); setMember(null); setView("groups"); })
          .finally(() => setSlugLoading(false));
      } else {
        setGroup(null); setMember(null); setView("groups");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectGroup = (g, slug) => {
    setGroup(g); setMember(null); setView("members");
    window.history.pushState({ groupId: g.group_id }, "", `/xem-diem/${slug || slugify(g.group_name)}`);
  };

  const backToGroups = () => {
    setGroup(null); setMember(null); setView("groups");
    window.history.pushState({}, "", "/tinh-diem-tai-xe-zalo");
  };

  const backToMembers = () => {
    setMember(null); setView("members");
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.ink, fontFamily: "system-ui,sans-serif" }}>
      <SiteNav />
      {slugLoading && (
        <div style={{ textAlign: "center", padding: 80, color: c.dim }}>Đang tải nhóm…</div>
      )}
      {!slugLoading && view === "groups" && (
        <GroupsView onSelect={selectGroup} />
      )}
      {!slugLoading && view === "members" && group && (
        <MembersView
          group={group}
          onBack={backToGroups}
          onSelect={m => { setMember(m); setView("transactions"); }}
        />
      )}
      {!slugLoading && view === "transactions" && group && member && (
        <TransactionsView
          group={group}
          member={member}
          onBack={backToMembers}
        />
      )}
      <SiteFooter />
    </div>
  );
}
