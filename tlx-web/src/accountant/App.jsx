import React, { useState, useEffect } from "react";
import { api, getToken, setToken } from "./api.js";
import useAccountantWorker from "./useAccountantWorker.js";
import AccountantApp from "./AccountantApp.jsx";

/* ===== CSS global ===== */
const GLOBAL_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #070b16; --card: #0e1525; --line: #1e2d45;
  --ink: #e2e8f0; --ink-dim: #64748b;
  --accent: #34d399; --accent-dim: #34d39933;
  --display: "Plus Jakarta Sans", sans-serif;
}
html, body { background: var(--bg); color: var(--ink); font-family: Inter, sans-serif; font-size: 15px; min-height: 100dvh; }
input, select, textarea, button { font-family: inherit; }
button { transition: opacity .15s; }
button:active { opacity: .75; }
::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 99px; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

function injectCss(css) {
  if (typeof document === "undefined") return;
  if (document.getElementById("app-css")) return;
  const s = document.createElement("style"); s.id = "app-css"; s.textContent = css;
  document.head.appendChild(s);
}
injectCss(GLOBAL_CSS);

export default function App() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const worker = useAccountantWorker();

  useEffect(() => {
    // Nhận token từ redirect app tài xế (hash #token=xxx)
    const hash = window.location.hash;
    if (hash.startsWith("#token=")) {
      const t = hash.slice(7);
      setToken(t);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!getToken()) { setLoading(false); return; }
    api.me().then(u => {
      if (u.role === "admin") {
        window.location.href = "/admin";
        return;
      }
      if (u.role !== "accountant") {
        setError("Tài khoản này không có quyền kế toán.");
        setToken(null); setLoading(false); return;
      }
      setMe(u);
    }).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const logout = async () => { await api.logout(); setMe(null); };

  if (loading) return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", color: "var(--ink-dim)" }}>Đang tải…</div>
  );

  if (!me) return <LoginScreen onLogin={u => { setMe(u); worker.connect(); }} error={error} />;
  return <AccountantApp me={me} onLogout={logout} worker={worker} />;
}

function LoginScreen({ onLogin, error: outerErr }) {
  const [phone, setPhone] = useState(()=>localStorage.getItem("tlx_kt_phone")||"");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(outerErr || "");

  const submit = async () => {
    if (!phone || !pass) { setErr("Nhập tài khoản và mật khẩu"); return; }
    setLoading(true); setErr("");
    try {
      const u = await api.login({ phone, pass });
      localStorage.setItem("tlx_kt_phone", phone.trim());
      if (u.role === "admin") {
        window.location.href = "/admin";
        return;
      }
      if (u.role !== "accountant") {
        setToken(null);
        setErr("Tài khoản tài xế không có quyền kế toán. Vui lòng dùng app tài xế.");
        setLoading(false); return;
      }
      onLogin(u);
    } catch (e) { setErr(e.message); setLoading(false); }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontFamily: "var(--display)", fontWeight: 800, fontSize: 26, marginBottom: 6 }}>Kế Toán</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 14 }}>Trợ Lý Tài Xế AI</div>
        </div>
        {[["Tài khoản", phone, setPhone, "text", "SĐT hoặc tên đăng nhập"],
          ["Mật khẩu", pass, setPass, "password", "••••••"]].map(([lbl, val, set, type, ph]) => (
          <div key={lbl} style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--ink-dim)", marginBottom: 5 }}>{lbl}</label>
            <input type={type} value={val} onChange={e => set(e.target.value)} placeholder={ph}
              onKeyDown={e => e.key === "Enter" && submit()}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", fontSize: 14, outline: "none" }} />
          </div>
        ))}
        {err && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: "#f87171", fontSize: 13, marginBottom: err.includes("tài xế") ? 6 : 0 }}>{err}</div>
            {err.includes("tài xế") && (
              <a href="/tai-xe" style={{ fontSize: 13, color: "#60a5fa", textDecoration: "underline" }}>
                → Mở app tài xế
              </a>
            )}
          </div>
        )}
        <button onClick={submit} disabled={loading} style={{ width: "100%", padding: "13px", borderRadius: 13, border: "none", cursor: loading ? "default" : "pointer", fontWeight: 800, fontSize: 15, background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#04140a" }}>
          {loading ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
      </div>
    </div>
  );
}
