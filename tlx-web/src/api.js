// ============================================================
// api.js — gọi HTTP API backend (đăng nhập, đăng ký, admin, Zalo QR)
// ============================================================
// Địa chỉ backend. Production: đặt VITE_API_BASE khi build (file .env của web).
const _cfgBase = import.meta.env?.VITE_API_BASE || "http://localhost:8082";
// Khi trang chạy HTTPS mà API vẫn HTTP → tự upgrade để tránh mixed content
const BASE = (typeof window !== "undefined" && window.location.protocol === "https:" && _cfgBase.startsWith("http:"))
  ? _cfgBase.replace("http:", "https:")
  : _cfgBase;

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
  login: async (b) => { const r = await req("/api/login", b); setToken(r.token); return r.user; },
  logout: async () => { try { await req("/api/logout", {}); } catch {} setToken(null); },
  me: () => req("/api/me", null, "GET"),
  // admin
  adminUsers: () => req("/api/admin/users", null, "GET"),
  approve: (id, plan, amount) => req("/api/admin/approve", { id, plan, amount }),
  renew: (id, amount) => req("/api/admin/renew", { id, amount }),
  ban: (id) => req("/api/admin/ban", { id }),
  setRole: (id, role) => req("/api/admin/set-role", { id, role }),
  setAccountant: (id, groupLimit) => req("/api/admin/set-role", { id, role: "accountant", groupLimit: Number(groupLimit) || 3 }),
  resetPassword: (id, newPass) => req("/api/admin/reset-password", { id, newPass }),
  deleteUser: (id) => req(`/api/admin/users/${id}`, null, "DELETE"),
  sessionHealth: () => req("/api/admin/session-health", null, "GET"),
  listAllGroups: () => req("/api/admin/groups", null, "GET"),
  mergeGroups: (sourceGroupId, targetGroupId) => req("/api/admin/groups/merge", { sourceGroupId, targetGroupId }),
  resetGroupData: (groupId) => req(`/api/admin/groups/${groupId}/reset`, {}),
  deleteGroup: (groupId) => req(`/api/admin/groups/${groupId}`, null, "DELETE"),
  revenueStats: (from, to) => req(`/api/admin/stats/revenue?from=${from}&to=${to}`, null, "GET"),
  userStats: (from, to, status) => req(`/api/admin/stats/users?from=${from}&to=${to}&status=${status||"all"}`, null, "GET"),
  getSettings: () => req("/api/admin/settings", null, "GET"),
  setSetting: (key, value) => req("/api/admin/settings", { key, value }),
  accountantGroups: (userId) => req(`/api/admin/accountant-groups/${userId}`, null, "GET"),
  groupAccountants: (groupId) => req(`/api/admin/groups/${groupId}/accountants`, null, "GET"),
  setAccountantGroup: (accountantId, groupId, groupName, action) => req("/api/admin/accountant-groups", { accountantId, groupId, groupName, action }),
  getDataStats: () => req("/api/admin/data-stats", null, "GET"),
  purgeTable: (table, days) => req("/api/admin/purge", { table, days }),
  listAccountantGroups: () => req("/api/admin/accountant-groups", null, "GET"),
  monitorGroups: (userId) => req(`/api/admin/monitor-groups/${userId}`, null, "GET"),
  setMonitorGroup: (monitorId, groupId, groupName, action) => req("/api/admin/monitor-groups", { monitorId, groupId, groupName, action }),
  adminGetMembers: (groupId) => req(`/api/accountant/members?groupId=${encodeURIComponent(groupId)}`, null, "GET"),
  adminAdjustPoints: (body) => req("/api/accountant/adjust-points", body),
  adminGetTransactions: (groupId, limit = 150) => req(`/api/accountant/transactions?groupId=${encodeURIComponent(groupId)}&limit=${limit}`, null, "GET"),
  adminDeleteTransaction: (id) => req(`/api/accountant/transactions/${id}`, null, "DELETE"),
  adminGetPendingTransfers: (groupId) => req(`/api/accountant/pending-transfers?groupId=${encodeURIComponent(groupId)}`, null, "GET"),
  adminApproveTransfer: (id) => req(`/api/accountant/pending-transfers/${id}/approve`, {}),
  adminRejectTransfer: (id) => req(`/api/accountant/pending-transfers/${id}/reject`, {}),
  setInstancePublicVisible: (instanceId, visible) => req(`/api/admin/accountant-groups/${encodeURIComponent(instanceId)}/public-visible`, { visible }, "PATCH"),
  mergeInstancesPreview: (sourceId, targetId) => req("/api/admin/accountant-groups/merge/preview", { sourceInstanceId: sourceId, targetInstanceId: targetId }),
  mergeInstancesExecute: (sourceId, targetId) => req("/api/admin/accountant-groups/merge/execute", { sourceInstanceId: sourceId, targetInstanceId: targetId }),
};

const _cfgWs = import.meta.env?.VITE_WS_BASE || "ws://localhost:8082/ws";
export const WS_BASE = (typeof window !== "undefined" && window.location.protocol === "https:" && _cfgWs.startsWith("ws:"))
  ? _cfgWs.replace("ws:", "wss:")
  : _cfgWs;
