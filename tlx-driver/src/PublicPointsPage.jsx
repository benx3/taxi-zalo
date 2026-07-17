import { useState, useEffect, useMemo, useCallback } from "react";
import { Search, ArrowLeft, Users, ChevronRight, Clock, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";

const BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8080";
// KT API: production dùng /admin-api (cùng domain), dev dùng localhost:8082
const KT_BASE = import.meta.env?.VITE_KT_API_BASE
  || (typeof window !== "undefined" && window.location.protocol === "https:"
      ? window.location.origin + "/admin-api"
      : "http://localhost:8082");
const get = async (path) => {
  const r = await fetch(BASE + path);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text.startsWith("<") ? `Lỗi ${r.status} — restart tlx-driver-service` : (text || `HTTP ${r.status}`));
  }
  return r.json();
};
const authGet = async (path, base = BASE) => {
  const tok = localStorage.getItem("tlx_token");
  const r = await fetch(base + path, { headers: { Authorization: "Bearer " + (tok || "") } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

const parseUrl = () => {
  const p = window.location.pathname;
  if (!p.startsWith("/xem-diem/")) return { groupSlug: null, memberUid: null };
  const rest = decodeURIComponent(p.slice("/xem-diem/".length));
  const slash = rest.indexOf("/");
  if (slash === -1) return { groupSlug: rest || null, memberUid: null };
  return { groupSlug: rest.slice(0, slash) || null, memberUid: rest.slice(slash + 1) || null };
};
const getSlugFromUrl = () => parseUrl().groupSlug;

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
        {(c2.adjustHistory || []).map((h, i) =>
          h?.cancelText ? <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: c.dim, whiteSpace: "nowrap", paddingTop: 1 }}>{h.cancelTime}</span>
            <span style={{ fontSize: 12, color: "#fbbf24" }}><b style={{ color: c.ink, marginRight: 4 }}>{h.canceller}:</b>{h.cancelText}</span>
          </div> : null
        )}
        {c2.cancelText  && row(c2.cancelTime,   c2.canceller,     c2.cancelText,  "#fbbf24")}
        {c2.freeText    && row(c2.freeTime,     c2.freePoster,    c2.freeText,    "#fb923c")}
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
  // Cancel/free/adjust không có tripText — chỉ hiển thị phần điều chỉnh
  if (c2 && (c2.cancelText || c2.freeText || c2.adjustText)) {
    return (
      <div style={{ background: "rgba(0,0,0,.3)", border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", marginBottom: 6, lineHeight: 1.5 }}>
        {c2.cancelText && row(c2.cancelTime, c2.canceller, c2.cancelText, "#fbbf24")}
        {c2.freeText   && row(c2.freeTime,   c2.freePoster, c2.freeText,  "#fb923c")}
        {c2.adjustText && row(c2.adjustTime, c2.adjuster,   c2.adjustText,"#a78bfa")}
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
  const approverName = tx.approved_by ? tx.approved_by.replace(/^[^:]+:/, "").trim() : null;

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
        {approverName
          ? <span style={{ fontSize: 11, color: c.dim, fontWeight: 600 }}>thủ công · <span style={{ color: "#a3e635" }}>{approverName}</span></span>
          : <span style={{ fontSize: 11, color: "#818cf8", fontWeight: 600 }}>auto</span>
        }
        <span style={{ fontSize: 11, color: c.dim, display: "flex", alignItems: "center", gap: 3, marginLeft: "auto" }}>
          <Clock size={10} /> {fmtTime(tx.created_at)}
        </span>
      </div>
    </div>
  );
}

/* ── GroupsView ─────────────────────────────────── */
function GroupsView({ onSelect, apiBase = BASE }) {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    authGet("/api/public/groups", apiBase).then(setGroups).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [apiBase]);

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
const TX_PAGE_LIMIT = 50;

const TX_STATUS = (tx) => {
  if (tx.type === "san") return { label: "San điểm", bg: "rgba(88,166,255,.12)", col: "#58a6ff" };
  const s = tx.status;
  if (!s || s === "approved") return { label: "Đã duyệt", bg: "rgba(52,211,153,.12)", col: "#34d399" };
  if (s === "pending") return { label: "Chờ duyệt", bg: "rgba(251,191,36,.12)", col: "#fbbf24" };
  if (s === "rejected") return { label: "Từ chối", bg: "rgba(248,113,113,.12)", col: "#f87171" };
  return { label: s, bg: "rgba(255,255,255,.06)", col: c.dim };
};

/* ── GroupTransactionsView ──────────────────────── */
function GroupTransactionsView({ group, txApiBase, txPath }) {
  const apiBase = txApiBase || BASE;
  const apiPath = txPath || "/api/monitor/group-transactions";
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const fetchTxs = useCallback(async (p, s) => {
    setLoading(true); setErr("");
    try {
      const offset = (p - 1) * TX_PAGE_LIMIT;
      const params = new URLSearchParams({ limit: TX_PAGE_LIMIT, offset });
      if (s) params.set("search", s);
      const tok = localStorage.getItem("tlx_token");
      const r = await fetch(`${apiBase}${apiPath}/${group.group_id}?${params}`,
        { headers: { Authorization: "Bearer " + (tok || "") } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [group.group_id, apiBase, apiPath]);

  useEffect(() => { fetchTxs(page, search); }, [fetchTxs, page, search]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const totalPages = Math.ceil(Math.max(total, 1) / TX_PAGE_LIMIT);

  return (
    <div>
      {/* Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
          <Search size={15} color={c.dim} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.card, color: c.ink, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            placeholder="Tìm theo tên poster / taker…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <span style={{ display: "flex", alignItems: "center", fontSize: 13, color: c.dim }}>
          {total} giao dịch
        </span>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: c.dim }}>Đang tải…</div>}
      {err && <div style={{ color: "#f87171", marginBottom: 12 }}>Lỗi: {err}</div>}
      {!loading && items.length === 0 && !err && (
        <div style={{ textAlign: "center", padding: "48px 0", color: c.dim }}>Không có giao dịch.</div>
      )}

      {items.map(tx => {
        const pts = Number(tx.points);
        const ptsStr = Math.abs(pts % 1) < 0.001 ? Math.abs(pts).toFixed(0) : Math.abs(pts).toFixed(2);
        const status = TX_STATUS(tx);
        const typeLabel = tx.type === "barem" ? "barem" : tx.type === "san" ? "san điểm" : tx.type === "auto" ? "tự động" : "thủ công";
        const from = tx.from_member_name || tx.from_member || "";
        const to = tx.to_member_name || tx.to_member || "";
        // Âm khi chỉ có from_member (poster trả điểm, không có người nhận riêng)
        const isNeg = !!tx.from_member && !tx.to_member;
        const ptsColor = isNeg ? "#f87171" : "#34d399";
        const approverName = tx.approved_by ? tx.approved_by.replace(/^[^:]+:/, "").trim() : null;
        return (
          <div key={tx.id} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: "11px 14px", marginBottom: 8, display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.ink, marginBottom: 4 }}>
                {from && to ? <><span style={{ color: "#60a5fa" }}>{from}</span><span style={{ color: c.dim }}> → </span><span style={{ color: "#34d399" }}>{to}</span></> :
                 from ? <span style={{ color: "#f87171" }}>{from}</span> :
                 to   ? <span style={{ color: "#34d399" }}>{to}</span> : <span style={{ color: c.dim }}>—</span>}
              </div>
              {tx.raw_text && <ConvoThread raw={tx.raw_text} />}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: status.bg, color: status.col, fontWeight: 700 }}>{status.label}</span>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.05)", color: c.dim, fontWeight: 600 }}>{typeLabel}</span>
                {tx.status === "approved" && (
                  approverName
                    ? <span style={{ fontSize: 11, color: c.dim, fontWeight: 600 }}>thủ công · <span style={{ color: "#a3e635" }}>{approverName}</span></span>
                    : <span style={{ fontSize: 11, color: "#818cf8", fontWeight: 600 }}>auto</span>
                )}
                {tx.status === "rejected" && approverName && (
                  <span style={{ fontSize: 11, color: c.dim }}>từ chối bởi <span style={{ color: "#f87171" }}>{approverName}</span></span>
                )}
                <span style={{ fontSize: 11, color: c.dim, marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
                  <Clock size={10} />{fmtTime(tx.created_at)}
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontWeight: 800, fontSize: 18, color: ptsColor, whiteSpace: "nowrap" }}>
              {isNeg ? "-" : "+"}{ptsStr}đ
            </div>
          </div>
        );
      })}

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "16px 0 0", flexWrap: "wrap" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === 1 ? c.dim : c.ink, cursor: page === 1 ? "default" : "pointer", fontSize: 14 }}>‹</button>
          {buildPageList(page, totalPages).map((pg, idx) =>
            pg === "…"
              ? <span key={`e${idx}`} style={{ width: 28, textAlign: "center", color: c.dim }}>…</span>
              : <button key={pg} onClick={() => setPage(pg)}
                  style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid", borderColor: pg === page ? c.accent : c.border, background: pg === page ? "rgba(52,211,153,.15)" : "transparent", color: pg === page ? c.accent : c.ink, fontWeight: pg === page ? 800 : 400, fontSize: 14, cursor: "pointer" }}>
                  {pg}
                </button>
          )}
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: page === totalPages ? c.dim : c.ink, cursor: page === totalPages ? "default" : "pointer", fontSize: 14 }}>›</button>
          <span style={{ fontSize: 12, color: c.dim, marginLeft: 6 }}>trang {page}/{totalPages}</span>
        </div>
      )}
    </div>
  );
}

/* ── PendingApprovalsView ───────────────────────── */
function PendingApprovalsView({ group, apiBase }) {
  const base = apiBase || BASE;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState({});
  const [editPoints, setEditPoints] = useState({}); // txId → string

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const tok = localStorage.getItem("tlx_token");
      const r = await fetch(`${base}/api/monitor/pending-transfers/${group.group_id}`,
        { headers: { Authorization: "Bearer " + (tok || "") } });
      if (r.status === 403) throw new Error("Bạn không có quyền trên nhóm này");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setItems(data);
      // Khởi tạo editPoints với giá trị hiện tại (chỉ cho tx chưa có giá trị đang sửa)
      setEditPoints(prev => {
        const next = { ...prev };
        data.forEach(tx => { if (!(tx.id in next)) next[tx.id] = String(Number(tx.points)); });
        return next;
      });
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [group.group_id, base]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const tok = localStorage.getItem("tlx_token");
      const body = action === "approve" && editPoints[id] !== undefined
        ? { points: Number(editPoints[id]) } : {};
      const r = await fetch(`${base}/api/monitor/pending-transfers/${id}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (tok || "") },
          body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
      setEditPoints(prev => { const n = { ...prev }; delete n[id]; return n; });
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(b => { const n = { ...b }; delete n[id]; return n; }); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: c.dim }}>{items.length} giao dịch đang chờ duyệt</span>
        <button onClick={load} style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${c.border}`, background: "transparent", color: c.dim, fontSize: 13, cursor: "pointer" }}>↻ Tải lại</button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: c.dim }}>Đang tải…</div>}
      {err && <div style={{ color: "#f87171", marginBottom: 12 }}>Lỗi: {err}</div>}
      {!loading && items.length === 0 && !err && (
        <div style={{ textAlign: "center", padding: "48px 0", color: c.dim }}>Không có giao dịch nào đang chờ duyệt.</div>
      )}

      {items.map(tx => {
        const pts = Number(tx.points);
        const from = tx.from_member_name || tx.from_member || "";
        const to = tx.to_member_name || tx.to_member || "";
        const typeLabel = tx.type === "barem" ? "barem" : tx.type === "san" ? "san điểm" : "thủ công";
        const isBusy = !!busy[tx.id];
        const curPts = editPoints[tx.id] ?? String(pts);
        const ptsChanged = Number(curPts) !== pts;
        return (
          <div key={tx.id} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            {/* Header: tên + ô điểm */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: c.ink, minWidth: 0 }}>
                {from && to
                  ? <><span style={{ color: "#60a5fa" }}>{from}</span><span style={{ color: c.dim }}> → </span><span style={{ color: "#34d399" }}>{to}</span></>
                  : from ? <span style={{ color: "#f87171" }}>{from}</span>
                  : to ? <span style={{ color: "#34d399" }}>{to}</span>
                  : <span style={{ color: c.dim }}>—</span>}
              </div>
              {/* Ô điểm chỉnh được */}
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={curPts}
                  onChange={e => setEditPoints(prev => ({ ...prev, [tx.id]: e.target.value }))}
                  disabled={isBusy}
                  style={{ width: 72, padding: "4px 8px", borderRadius: 7, border: `1px solid ${ptsChanged ? c.accent : c.border}`, background: "rgba(0,0,0,.3)", color: ptsChanged ? c.accent : "#fbbf24", fontWeight: 700, fontSize: 15, textAlign: "center", outline: "none" }}
                />
                <span style={{ fontSize: 13, color: ptsChanged ? c.accent : "#fbbf24", fontWeight: 700 }}>đ</span>
              </div>
            </div>
            {tx.raw_text && <ConvoThread raw={tx.raw_text} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(251,191,36,.12)", color: "#fbbf24", fontWeight: 700 }}>Chờ duyệt</span>
              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 5, background: "rgba(255,255,255,.05)", color: c.dim, fontWeight: 600 }}>{typeLabel}</span>
              {ptsChanged && (
                <span style={{ fontSize: 11, color: c.accent, fontWeight: 600 }}>
                  {pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(2)}đ → {Number(curPts) % 1 === 0 ? Number(curPts).toFixed(0) : Number(curPts).toFixed(2)}đ
                </span>
              )}
              <span style={{ fontSize: 11, color: c.dim, marginLeft: "auto", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={10} />{fmtTime(tx.created_at)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                disabled={isBusy}
                onClick={() => act(tx.id, "approve")}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: isBusy ? "#21262d" : "rgba(52,211,153,.15)", color: isBusy ? c.dim : "#34d399", fontWeight: 700, fontSize: 13, cursor: isBusy ? "default" : "pointer" }}>
                {isBusy ? "…" : ptsChanged ? `✓ Duyệt ${Number(curPts) % 1 === 0 ? Number(curPts).toFixed(0) : Number(curPts).toFixed(2)}đ` : "✓ Duyệt"}
              </button>
              <button
                disabled={isBusy}
                onClick={() => act(tx.id, "reject")}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: isBusy ? "#21262d" : "rgba(248,113,113,.1)", color: isBusy ? c.dim : "#f87171", fontWeight: 700, fontSize: 13, cursor: isBusy ? "default" : "pointer" }}>
                {isBusy ? "…" : "✗ Từ chối"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── MembersView ────────────────────────────────── */
function MembersView({ group, onBack, onSelect, meRole, allowedGroupIds, txApiBase, txPath }) {
  const canMonitor = ["admin", "accountant"].includes(meRole)
    || (meRole === "monitor" && (allowedGroupIds === null || (Array.isArray(allowedGroupIds) && allowedGroupIds.includes(group.group_id))));
  const [activeTab, setActiveTab] = useState("leaderboard");
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("points");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [copied, setCopied] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null); // { uid, name, points }
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustFlash, setAdjustFlash] = useState(null); // { ok, msg }

  const shareUrl = `${window.location.origin}/xem-diem/${group.slug || slugify(group.group_name)}`;
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const loadMembers = useCallback(() => {
    setLoading(true);
    get(`/api/public/members/${group.group_id}`).then(setMembers).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [group.group_id]);

  const doAdjust = async () => {
    const delta = parseFloat(adjustDelta);
    if (!delta || isNaN(delta) || !adjustTarget) return;
    setAdjusting(true);
    try {
      const tok = localStorage.getItem("tlx_token");
      const adjustBase = txApiBase || BASE;
      const r = await fetch(`${adjustBase}/api/monitor/adjust-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (tok || "") },
        body: JSON.stringify({ groupId: group.group_id, zaloUid: adjustTarget.uid, delta, reason: adjustReason.trim() }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
      setAdjustFlash({ ok: true, msg: `Đã sửa ${delta > 0 ? "+" : ""}${delta}đ cho ${adjustTarget.name}` });
      setAdjustTarget(null); setAdjustDelta(""); setAdjustReason("");
      loadMembers();
      setTimeout(() => setAdjustFlash(null), 3000);
    } catch (e) {
      setAdjustFlash({ ok: false, msg: e.message });
      setTimeout(() => setAdjustFlash(null), 4000);
    } finally { setAdjusting(false); }
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

      {/* Tabs */}
      {canMonitor && (
        <div style={{ display: "flex", gap: 2, marginBottom: 18, borderBottom: `1px solid ${c.border}` }}>
          {[["leaderboard", "Bảng xếp hạng"], ["transactions", "Lịch sử giao dịch"], ["approve", "Duyệt điểm"]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ padding: "9px 18px", border: "none", borderBottom: activeTab === tab ? `2px solid ${c.accent}` : "2px solid transparent", background: "transparent", color: activeTab === tab ? c.accent : c.dim, fontWeight: activeTab === tab ? 700 : 500, fontSize: 14, cursor: "pointer", transition: "color .15s", marginBottom: -1 }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {canMonitor && activeTab === "transactions" && (
        <GroupTransactionsView group={group} txApiBase={txApiBase} txPath={txPath} />
      )}

      {canMonitor && activeTab === "approve" && (
        <PendingApprovalsView group={group} apiBase={txApiBase || BASE} />
      )}

      {(!canMonitor || activeTab === "leaderboard") && <>
      {adjustFlash && (
        <div style={{ padding: "10px 14px", borderRadius: 10, marginBottom: 12, background: adjustFlash.ok ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)", color: adjustFlash.ok ? "#34d399" : "#f87171", fontSize: 13, fontWeight: 600 }}>
          {adjustFlash.msg}
        </div>
      )}

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
        <div style={{ display: "grid", gridTemplateColumns: `48px 1fr 96px 96px ${canMonitor ? "36px" : "20px"}`, gap: 8, padding: "10px 16px", borderBottom: `1px solid ${c.border}`, fontSize: 11, color: c.dim, fontWeight: 700 }}>
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
          const isEditing = canMonitor && adjustTarget?.uid === m.zalo_uid;
          const isLast = i === paged.length - 1;
          return (
            <div key={m.zalo_uid}>
              {/* Member row */}
              <div
                style={{ display: "grid", gridTemplateColumns: `48px 1fr 96px 96px ${canMonitor ? "36px" : "20px"}`, gap: 8, padding: "13px 16px", borderBottom: (!isLast || isEditing) ? `1px solid ${c.border}` : "none", cursor: "pointer", alignItems: "center", transition: "background .1s", background: isEditing ? "rgba(52,211,153,.04)" : "transparent" }}
                onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = "#1c2128"; }}
                onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = "transparent"; }}
                onClick={() => { if (!isEditing) onSelect(m); }}>
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
                {canMonitor
                  ? <button
                      onClick={e => {
                        e.stopPropagation();
                        if (isEditing) { setAdjustTarget(null); setAdjustDelta(""); setAdjustReason(""); }
                        else { setAdjustTarget({ uid: m.zalo_uid, name: m.alias || m.display_name || m.zalo_uid, points: pts }); setAdjustDelta(""); setAdjustReason(""); }
                      }}
                      title={isEditing ? "Đóng" : "Sửa điểm"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: isEditing ? c.accent : c.dim, fontSize: 15, padding: "2px 4px", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}
                      onMouseEnter={e => e.currentTarget.style.color = c.accent}
                      onMouseLeave={e => { if (!isEditing) e.currentTarget.style.color = c.dim; }}>
                      {isEditing ? "✕" : "✏"}
                    </button>
                  : <ChevronRight size={15} color={c.dim} />
                }
              </div>
              {/* Inline adjust form */}
              {isEditing && (
                <div style={{ padding: "12px 16px", borderBottom: !isLast ? `1px solid ${c.border}` : "none", background: "rgba(0,0,0,.15)" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="number" step="0.5" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)}
                      placeholder="+1 hoặc -2.5" autoFocus
                      style={{ flex: "0 0 120px", padding: "8px 10px", borderRadius: 9, border: `1px solid ${c.border}`, background: "rgba(0,0,0,.25)", color: c.ink, fontSize: 13, outline: "none" }}
                      onKeyDown={e => e.key === "Enter" && doAdjust()} />
                    <input type="text" value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
                      placeholder="Lý do (tùy chọn)"
                      style={{ flex: 1, minWidth: 130, padding: "8px 10px", borderRadius: 9, border: `1px solid ${c.border}`, background: "rgba(0,0,0,.25)", color: c.ink, fontSize: 13, outline: "none" }}
                      onKeyDown={e => e.key === "Enter" && doAdjust()} />
                    <button onClick={doAdjust} disabled={adjusting || !adjustDelta}
                      style={{ padding: "8px 18px", borderRadius: 9, border: "none", cursor: adjusting || !adjustDelta ? "default" : "pointer", fontWeight: 700, fontSize: 13, background: "rgba(52,211,153,.2)", color: "#34d399", opacity: adjusting || !adjustDelta ? 0.5 : 1 }}>
                      {adjusting ? "Đang lưu…" : "Lưu"}
                    </button>
                  </div>
                </div>
              )}
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
      </>}
    </div>
  );
}

/* ── TransactionsView ───────────────────────────── */
function TransactionsView({ group, member, groupSlug, onBack }) {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/xem-diem/${groupSlug}/${member.zalo_uid}`;
  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  useEffect(() => {
    get(`/api/public/transactions/${group.group_id}/${member.zalo_uid}?limit=200`)
      .then(data => { setTxs([...data].sort((a, b) => b.created_at - a.created_at)); setPage(1); })
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
        <button onClick={copyLink} style={{ flexShrink: 0, padding: "7px 14px", borderRadius: 9, border: `1px solid ${c.border}`, background: copied ? "rgba(52,211,153,.15)" : "rgba(255,255,255,.05)", color: copied ? c.accent : c.dim, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          {copied ? "✓ Đã sao chép!" : "🔗 Chia sẻ"}
        </button>
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
  const [meRole, setMeRole] = useState("public");
  const [meRoleLoaded, setMeRoleLoaded] = useState(false);
  const [allowedGroupIds, setAllowedGroupIds] = useState(null);
  // txApiBase: service nào để gọi group-transactions (driver vs KT)
  const [txApiBase, setTxApiBase] = useState(BASE);
  const [txPath, setTxPath] = useState("/api/monitor/group-transactions");

  // Kiểm tra role: thử driver service trước (monitor), fallback KT service (admin/accountant)
  useEffect(() => {
    const tok = localStorage.getItem("tlx_token");
    if (!tok) { setMeRoleLoaded(true); return; }
    authGet("/api/me")
      .then(u => {
        if (u?.role) setMeRole(u.role);
        if (["monitor", "admin", "accountant"].includes(u?.role)) {
          authGet("/api/monitor/my-groups")
            .then(d => setAllowedGroupIds(d.all ? null : (d.groupIds || [])))
            .catch(() => setAllowedGroupIds([]));
        }
      })
      .catch(() => {
        // driver service không nhận token → thử KT service
        return fetch(KT_BASE + "/api/me", { headers: { Authorization: "Bearer " + tok } })
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(u => {
            if (u?.role) setMeRole(u.role);
            if (u?.role === "admin" || u?.role === "accountant") {
              setAllowedGroupIds(null);
              setTxApiBase(KT_BASE);
              setTxPath("/api/admin/group-transactions");
            }
          })
          .catch(() => {});
      })
      .finally(() => setMeRoleLoaded(true));
  }, []);

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
        canonical: `${origin}/xem-diem/${gSlug}/${member?.zalo_uid || ""}`,
      });
    }
  }, [view, group, member]);

  // Tải nhóm + thành viên từ slug/uid
  const loadFromUrl = useCallback(({ groupSlug, memberUid }) => {
    if (!groupSlug) { setGroup(null); setMember(null); setView("groups"); return; }
    setSlugLoading(true);
    get(`/api/public/by-slug/${encodeURIComponent(groupSlug)}`)
      .then(g => {
        setGroup(g);
        if (memberUid) {
          return get(`/api/public/members/${g.group_id}`)
            .then(ms => {
              const m = ms.find(x => x.zalo_uid === memberUid);
              if (m) { setMember(m); setView("transactions"); }
              else { setMember(null); setView("members"); }
            });
        } else {
          setMember(null); setView("members");
        }
      })
      .catch(() => { setGroup(null); setMember(null); setView("groups"); })
      .finally(() => setSlugLoading(false));
  }, []);

  // URL routing: load nhóm từ slug + popstate
  useEffect(() => {
    const parsed = parseUrl();
    if (parsed.groupSlug) loadFromUrl(parsed);

    const onPop = () => loadFromUrl(parseUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadFromUrl]);

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
    const gSlug = group ? (group.slug || slugify(group.group_name)) : "";
    window.history.pushState({}, "", `/xem-diem/${gSlug}`);
  };

  const selectMember = (g, m) => {
    setMember(m); setView("transactions");
    const gSlug = g.slug || slugify(g.group_name);
    window.history.pushState({}, "", `/xem-diem/${gSlug}/${m.zalo_uid}`);
  };

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.ink, fontFamily: "system-ui,sans-serif" }}>
      <SiteNav />
      {slugLoading && (
        <div style={{ textAlign: "center", padding: 80, color: c.dim }}>Đang tải nhóm…</div>
      )}
      {!slugLoading && view === "groups" && !meRoleLoaded && (
        <div style={{ textAlign: "center", padding: 80, color: c.dim }}>Đang kiểm tra quyền…</div>
      )}
      {!slugLoading && view === "groups" && meRoleLoaded && !["admin", "accountant"].includes(meRole) && (
        <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: "0 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: c.ink, marginBottom: 8 }}>Không có quyền truy cập</h2>
          <p style={{ color: c.dim, marginBottom: 24 }}>Danh sách nhóm chỉ dành cho kế toán. Nếu bạn có link nhóm cụ thể, hãy truy cập trực tiếp.</p>
          <a href="/?screen=login" style={{ display: "inline-block", padding: "10px 24px", borderRadius: 9, background: "rgba(52,211,153,.15)", color: c.accent, fontWeight: 700, textDecoration: "none" }}>Đăng nhập</a>
        </div>
      )}
      {!slugLoading && view === "groups" && meRoleLoaded && ["admin", "accountant"].includes(meRole) && (
        <GroupsView onSelect={selectGroup} apiBase={txApiBase} />
      )}
      {!slugLoading && view === "members" && group && (
        <MembersView
          group={group}
          onBack={backToGroups}
          onSelect={m => selectMember(group, m)}
          meRole={meRole}
          allowedGroupIds={allowedGroupIds}
          txApiBase={txApiBase}
          txPath={txPath}
        />
      )}
      {!slugLoading && view === "transactions" && group && member && (
        <TransactionsView
          group={group}
          member={member}
          groupSlug={group.slug || slugify(group.group_name)}
          onBack={backToMembers}
        />
      )}
      <SiteFooter />
    </div>
  );
}
