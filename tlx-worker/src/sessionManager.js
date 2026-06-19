// ============================================================
// sessionManager.js — quản lý NHIỀU phiên Zalo, mỗi user một phiên độc lập.
// Cô lập hoàn toàn: cuốc/nhóm của user A không lọt sang user B.
//
// Mỗi phiên giữ: api zca-js riêng, selfId riêng, danh sách nhóm riêng,
// nhóm đang theo dõi riêng, và các "claim" (cuốc đã xin) riêng.
// ============================================================
import { Zalo } from "zca-js";
import { parseTrip, isConfirmMessage } from "./parser.js";
import * as dbm from "./dbLayer.js";

const OK_MIN = Number(process.env.OK_DELAY_MIN || 400);
const OK_MAX = Number(process.env.OK_DELAY_MAX || 1200);
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// userId -> phiên
const sessions = new Map();

export function getSession(userId) { return sessions.get(userId); }
export function hasSession(userId) { return sessions.has(userId); }
export function sessionCount() { return sessions.size; }

/**
 * Tạo phiên Zalo cho 1 user.
 * onEvent(userId, event) — callback đẩy dữ liệu về đúng client của user đó:
 *   {type:"groups",...} | {type:"trip",...} | {type:"won",...} | {type:"taken"|...}
 */
export async function startSessionFromStored(userId, onEvent) {
  if (sessions.has(userId)) return sessions.get(userId);
  const stored = await dbm.getZaloSession(userId);
  if (!stored?.cookie) throw new Error("Chưa có phiên Zalo cho user này");

  const zalo = new Zalo();
  const api = await zalo.login({ cookie: stored.cookie, imei: stored.imei, userAgent: stored.userAgent });
  return attach(userId, api, onEvent);
}

/** Đăng nhập QR cho user (tự quét). Trả {api, qrPromise}. */
export async function loginQR(userId, onQR, onEvent) {
  const zalo = new Zalo();
  const api = await zalo.loginQR({}, async (ev) => {
    try { if (ev?.actions?.saveToFile) { /* worker không lưu file, gửi base64 về app */ } } catch {}
    onQR(ev);
  });
  // lưu phiên vào DB để lần sau khỏi quét lại
  const ctx = api.getContext();
  await dbm.saveZaloSession(userId, {
    cookie: ctx.cookie, imei: ctx.imei, userAgent: ctx.userAgent,
    zaloUid: ctx.uid || ctx.userId || null,
  });
  return attach(userId, api, onEvent);
}

// Gắn listener + state cho 1 phiên
function attach(userId, api, onEvent) {
  const ctx = api.getContext();
  const selfId = ctx.uid || ctx.userId || null;

  const sess = {
    userId, api, selfId,
    groups: [],                 // [{id,name}]
    selected: new Set(),        // nhóm theo dõi (rỗng = tất cả)
    groupNameById: new Map(),
    claims: new Map(),          // `${groupId}:${ownerId}` -> {savedId, msgId, text}
    rawMsgById: new Map(),      // msgId -> object message gốc (để reply đúng tin)
    sentOks: new Map(),         // msgId cuốc -> {groupId, sent, savedId} (để thu hồi khi huỷ)
    onEvent,
  };
  sessions.set(userId, sess);

  api.listener.on("message", (msg) => onMessage(sess, msg));
  api.listener.on("error", (e) => console.error(`[${userId}] listener:`, e?.message || e));
  api.listener.start();

  loadGroups(sess).catch(e => console.error(`[${userId}] loadGroups:`, e?.message || e));
  return sess;
}

async function loadGroups(sess) {
  const { api } = sess;
  const res = await api.getAllGroups();
  const ids = res?.gridVerMap ? Object.keys(res.gridVerMap)
    : Array.isArray(res) ? res : Object.keys(res || {});
  sess.groups = [];
  for (const id of ids) {
    let name = id;
    try {
      const info = await api.getGroupInfo(id);
      const g = info?.gridInfoMap?.[id] || info?.[id] || info;
      name = g?.name || g?.groupName || id;
    } catch {}
    sess.groupNameById.set(id, name);
    sess.groups.push({ id, name });
  }
  sess.onEvent(sess.userId, { type: "groups", groups: sess.groups, selected: [...sess.selected] });
}

function onMessage(sess, msg) {
  try {
    const isGroup = msg?.type === 1 || (msg?.threadId && String(msg.threadId).length > 15);
    if (!isGroup) return;
    const groupId = String(msg.threadId);
    if (sess.selected.size > 0 && !sess.selected.has(groupId)) return;

    const senderId = String(msg.data?.uidFrom || msg.data?.senderId || "");
    const senderName = msg.data?.dName || "Không rõ";
    const text = typeof msg.data?.content === "string" ? msg.data.content : (msg.data?.content?.title || "");
    const msgId = String(msg.data?.msgId || msg.data?.cliMsgId || Date.now());
    const groupName = sess.groupNameById.get(groupId) || msg.data?.groupName || groupId;
    const time = new Date().toLocaleTimeString("vi-VN", { hour12: false });

    // (A) chủ cuốc xác nhận cho mình?
    const key = `${groupId}:${senderId}`;
    if (sess.claims.has(key) && isConfirmMessage(text) && isTaggingSelf(sess, msg)) {
      const c = sess.claims.get(key);
      sess.claims.delete(key);
      Promise.resolve(dbm.markTripWon(c.savedId)).catch(()=>{});
      sess.onEvent(sess.userId, { type: "won", groupId, group: groupName, msgId: c.msgId, text: c.text });
      return;
    }

    // (B) cuốc mới
    const trip = parseTrip({ groupId, groupName, senderId, senderName, msgId, text, time });
    if (trip) {
      // lưu object message GỐC để sau này reply (trích dẫn) đúng tin này
      sess.rawMsgById.set(msgId, msg);
      // giới hạn cache 30 tin gần nhất là đủ để reply
      if (sess.rawMsgById.size > 30) {
        const firstKey = sess.rawMsgById.keys().next().value;
        sess.rawMsgById.delete(firstKey);
      }
      sess.onEvent(sess.userId, { type: "trip", trip });
    }
  } catch (e) {
    console.error(`[${sess.userId}] onMessage:`, e?.message || e);
  }
}

function isTaggingSelf(sess, msg) {
  const q = msg.data?.quote?.ownerId || msg.data?.quote?.uidFrom;
  if (q && String(q) === String(sess.selfId)) return true;
  const mentions = msg.data?.mentions || [];
  if (Array.isArray(mentions) && mentions.some(m => String(m.uid) === String(sess.selfId))) return true;
  return false;
}

// ----- thao tác từ app -----
export function setWatchedGroups(userId, groupIds) {
  const sess = sessions.get(userId); if (!sess) return;
  sess.selected = new Set(groupIds || []);
  sess.onEvent(userId, { type: "groups", groups: sess.groups, selected: [...sess.selected] });
}

export async function takeTrip(userId, { groupId, msgId, ownerId, text, trip }) {
  const sess = sessions.get(userId); if (!sess) return;
  // lưu cuốc đã nhận vào DB (status pending)
  const savedId = await dbm.saveTrip(userId, trip || { groupId, group: sess.groupNameById.get(groupId), sender: "", text, price: null }, "pending");
  try {
    await sleep(rand(OK_MIN, OK_MAX));
    const rawMsg = sess.rawMsgById.get(msgId);   // object tin gốc để reply
    const sent = await replyOk(sess.api, groupId, rawMsg, msgId);  // sent = thông tin tin Ok vừa gửi
    if (ownerId) sess.claims.set(`${groupId}:${ownerId}`, { savedId, msgId, text, takenAt: Date.now() });
    // lưu để có thể thu hồi khi hủy (key theo msgId của cuốc)
    sess.sentOks.set(msgId, { groupId, sent, savedId });
    sess.onEvent(userId, { type: "taken", groupId, msgId });
  } catch (e) {
    sess.onEvent(userId, { type: "take_failed", groupId, msgId, error: String(e?.message || e) });
  }
}

// Hủy xác nhận: THU HỒI tin "Ok" vừa reply trong nhóm.
export async function cancelTake(userId, { msgId }) {
  const sess = sessions.get(userId); if (!sess) return;
  const rec = sess.sentOks.get(msgId);
  if (!rec) { sess.onEvent(userId, { type: "cancel_failed", msgId, error: "Không tìm thấy tin để thu hồi" }); return; }
  try {
    await undoMessage(sess.api, rec.groupId, rec.sent);
    sess.sentOks.delete(msgId);
    // xoá khỏi DB cuốc đã lưu + huỷ claim đang chờ
    if (rec.savedId) await dbm.deleteSavedTrip(rec.savedId);
    for (const [k, v] of sess.claims) if (v.msgId === msgId) sess.claims.delete(k);
    sess.onEvent(userId, { type: "cancelled", msgId });
  } catch (e) {
    sess.onEvent(userId, { type: "cancel_failed", msgId, error: String(e?.message || e) });
  }
}

// Reply "Ok" — TRÍCH DẪN tin của người đăng cuốc. Trả về thông tin tin đã gửi (để thu hồi).
async function replyOk(api, groupId, rawMsg, msgId) {
  const MSG = "Ok";
  if (rawMsg) {
    try { return await api.sendMessage({ msg: MSG, quote: rawMsg }, groupId, 1); } catch {}
    try { return await api.sendMessage({ msg: MSG, quote: rawMsg.data }, groupId, 1); } catch {}
  }
  try { return await api.sendMessage({ msg: MSG, quote: msgId }, groupId, 1); } catch {}
  return await api.sendMessage(MSG, groupId, 1);
}

// Thu hồi tin đã gửi. zca-js: api.undo(message) hoặc deleteMessage tuỳ phiên bản.
async function undoMessage(api, groupId, sent) {
  // 'sent' là kết quả trả về của sendMessage, thường chứa msgId/cliMsgId
  const ids = extractSentIds(sent);
  // thử các chữ ký hàm thu hồi phổ biến của zca-js
  if (typeof api.undo === "function") {
    try { return await api.undo(sent, groupId, 1); } catch {}
    try { return await api.undo({ ...ids, threadId: groupId, type: 1 }); } catch {}
  }
  if (typeof api.deleteMessage === "function") {
    try { return await api.deleteMessage(sent, groupId, 1); } catch {}
    try { return await api.deleteMessage({ ...ids, threadId: groupId, type: 1 }); } catch {}
  }
  throw new Error("Phiên bản zca-js này không hỗ trợ thu hồi tin (api.undo/deleteMessage)");
}

function extractSentIds(sent) {
  const d = sent?.message || sent?.data || sent || {};
  return { msgId: d.msgId || d.msgID, cliMsgId: d.cliMsgId || d.cliMsgID };
}

export function stopSession(userId) {
  const sess = sessions.get(userId);
  if (!sess) return;
  try { sess.api.listener.stop?.(); } catch {}
  sessions.delete(userId);
}

// Đăng xuất Zalo: dừng phiên đang chạy + xoá session khỏi DB.
// Sau đó user có thể quét QR tài khoản Zalo KHÁC.
export function logoutZalo(userId) {
  stopSession(userId);
  dbm.clearZaloSession(userId);  // fire-and-forget ok
}

// dọn claim cũ mọi phiên
setInterval(() => {
  const cut = Date.now() - 3 * 60 * 1000;
  for (const sess of sessions.values())
    for (const [k, v] of sess.claims) if ((v.takenAt || 0) < cut) sess.claims.delete(k);
}, 30 * 1000);
