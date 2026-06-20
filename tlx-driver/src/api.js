// Driver app — gọi tlx-driver-service (port 8080)
const BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8080";

let token = localStorage.getItem("tlx_token") || null;
export function getToken() { return token; }
export function setToken(t) { token = t; t ? localStorage.setItem("tlx_token", t) : localStorage.removeItem("tlx_token"); }

async function req(path, body, method = "POST") {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Lỗi máy chủ");
  return data;
}

export const api = {
  register: (b) => req("/api/register", b),
  login: async (b) => { const r = await req("/api/login", b); setToken(r.token); return r.user; },
  logout: async () => { try { await req("/api/logout", {}); } catch {} setToken(null); },
  me: () => req("/api/me", null, "GET"),
  changePassword: (oldPass, newPass) => req("/api/change-password", { oldPass, newPass }),
  savedTrips: () => req("/api/trips/saved", null, "GET"),
  startZaloQR: () => req("/api/zalo/login-qr", {}),
  logoutZalo: () => req("/api/zalo/logout", {}),
};

export const WS_BASE = import.meta.env?.VITE_WS_BASE || "ws://localhost:8080/ws";
