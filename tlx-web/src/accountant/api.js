const BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8082";
export const WS_BASE = import.meta.env?.VITE_WS_BASE || "ws://localhost:8082/ws";

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
  changePassword: (oldPass, newPass) => req("/api/change-password", { oldPass, newPass }),

  // Nhóm kế toán phụ trách (DB)
  myGroups: () => req("/api/accountant/groups", null, "GET"),
  confirmGroups: () => req("/api/accountant/confirm-groups", {}),
  // Nhóm Zalo live (cần session đang chạy)
  zaloGroups: () => req("/api/accountant/zalo-groups", null, "GET"),
  // Zalo QR
  startZaloQR: () => req("/api/zalo/login-qr", {}),
  logoutZalo: () => req("/api/zalo/logout", {}),

  // Thành viên
  listMembers: (groupId) => req(`/api/accountant/members?groupId=${encodeURIComponent(groupId)}`, null, "GET"),
  upsertMember: (b) => req("/api/accountant/members", b),
  setAlias: (b) => req("/api/accountant/members/alias", b, "PATCH"),
  syncMembers: () => req("/api/accountant/sync-members", {}),
  enrichMemberNames: (groupId) => req(`/api/accountant/groups/${encodeURIComponent(groupId)}/enrich-members`, {}),
  setGroupPublicVisible: (groupId, visible) => req(`/api/accountant/groups/${encodeURIComponent(groupId)}/public-visible`, { visible }, "PATCH"),
  lookupUser: (phone) => req(`/api/accountant/lookup-user?phone=${encodeURIComponent(phone)}`, null, "GET"),
  importMembersPreview: (groupId, rows) => req("/api/accountant/members/import-preview", { groupId, rows }),
  importMembersConfirm: (groupId, rows) => req("/api/accountant/members/import-confirm", { groupId, rows }),

  // Giao dịch điểm
  listTransactions: (groupId, zaloUid, limit) => {
    let url = `/api/accountant/transactions?groupId=${encodeURIComponent(groupId)}`;
    if (zaloUid) url += `&zaloUid=${encodeURIComponent(zaloUid)}`;
    if (limit) url += `&limit=${limit}`;
    return req(url, null, "GET");
  },
  adjustPoints: (b) => req("/api/accountant/adjust-points", b),
  updateTransaction: (id, b) => req(`/api/accountant/transactions/${id}`, b, "PATCH"),
  deleteTransaction: (id) => req(`/api/accountant/transactions/${id}`, null, "DELETE"),

  // San điểm — giao dịch chờ duyệt
  pendingTransfers: (groupId) => req(`/api/accountant/pending-transfers?groupId=${encodeURIComponent(groupId)}`, null, "GET"),
  approveTransfer: (id) => req(`/api/accountant/pending-transfers/${id}/approve`, {}),
  rejectTransfer: (id) => req(`/api/accountant/pending-transfers/${id}/reject`, {}),

  // Raw messages
  rawMessages: (groupId, date, search) => {
    let url = `/api/accountant/raw-messages?groupId=${encodeURIComponent(groupId)}`;
    if (date) url += `&date=${encodeURIComponent(date)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return req(url, null, "GET");
  },

  // Barem
  getRules: (groupId) => req(`/api/accountant/rules/${encodeURIComponent(groupId)}`, null, "GET"),
  saveRules: (groupId, b) => req(`/api/accountant/rules/${encodeURIComponent(groupId)}`, b),

  // KT Zalo UID của nhóm (auto san điểm)
  getKtUid: (groupId) => req(`/api/accountant/kt-uid/${encodeURIComponent(groupId)}`, null, "GET"),
  saveKtUid: (groupId, b) => req(`/api/accountant/kt-uid/${encodeURIComponent(groupId)}`, b),
};
