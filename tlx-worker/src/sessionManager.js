// ============================================================
// sessionManager.js — quản lý NHIỀU phiên Zalo, mỗi user một phiên độc lập.
// Cô lập hoàn toàn: cuốc/nhóm của user A không lọt sang user B.
//
// Mỗi phiên giữ: api zca-js riêng, selfId riêng, danh sách nhóm riêng,
// nhóm đang theo dõi riêng, và các "claim" (cuốc đã xin) riêng.
// ============================================================
import { Zalo } from "zca-js";
import { parseMultipleTrips, isConfirmMessage, isClaimMessage, parseBonus } from "./parser.js";
import { parseWithAI, aiToTrip } from "./aiParser.js";
import { transcribeVoice, getVoiceUrl } from "./stt.js";
import { config } from "./config.js";
import * as dbm from "./dbLayer.js";

const OK_MIN = Number(process.env.OK_DELAY_MIN || 400);
const OK_MAX = Number(process.env.OK_DELAY_MAX || 1200);
const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Nhường event loop cho driver messages / HTTP requests khác xử lý
const yieldLoop = () => new Promise(r => setImmediate(r));

// userId -> phiên
const sessions = new Map();

// Cache barem rules theo groupId (TTL 90s) — tránh query DB mỗi tin nhắn
const _rulesCache = new Map(); // groupId → { row, ts }
async function getBaremRulesCached(groupId) {
  const entry = _rulesCache.get(groupId);
  if (entry && Date.now() - entry.ts < 90_000) return entry.row;
  const row = await dbm.getRules(groupId);
  _rulesCache.set(groupId, { row, ts: Date.now() });
  return row;
}
export function invalidateBaremCache(groupId) { _rulesCache.delete(groupId); }

export function getSession(userId) { return sessions.get(userId); }
export function hasSession(userId) { return sessions.has(userId); }
export function sessionCount() { return sessions.size; }

export function getSessionsHealth() {
  const out = [];
  for (const [userId, sess] of sessions.entries()) {
    out.push({
      userId,
      selfId:       sess.selfId,
      selfName:     sess.selfName,
      isAccountant: sess.isAccountant,
      lastMsgAt:    sess.lastMsgAt,
      selected:     [...sess.selected],
      groupCount:   sess.groups.length,
    });
  }
  return out;
}

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

  // Lưu lại cookies đã được Zalo refresh qua Set-Cookie trong quá trình login
  // (cookies trong DB có thể cũ — Zalo rotate chúng mỗi request)
  const ctx = api.getContext();
  Promise.resolve(dbm.saveZaloSession(userId, {
    cookie: ctx.cookie, imei: ctx.imei, userAgent: ctx.userAgent,
    zaloUid: ctx.uid || ctx.userId || stored.zaloUid || null,
  })).catch(e => console.warn(`[${userId}] Không lưu cookie sau restore:`, e?.message || e));

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

// Lưu cookies hiện tại của 1 phiên về DB (gọi nhiều lần an toàn)
async function persistCookies(userId, api) {
  const ctx = api.getContext();
  if (!ctx?.cookie) return;
  await dbm.saveZaloSession(userId, {
    cookie: ctx.cookie, imei: ctx.imei, userAgent: ctx.userAgent,
    zaloUid: ctx.uid || ctx.userId || null,
  });
}

// Gắn listener + state cho 1 phiên
function attach(userId, api, onEvent) {
  const ctx = api.getContext();
  const selfId = ctx.uid || ctx.userId || null;
  const selfName = ctx.name || ctx.displayName || ctx.dName || null;

  const sess = {
    userId, api, selfId, selfName,
    groups: [],                 // [{id,name,link}]
    selected: new Set(),        // nhóm theo dõi (rỗng = tất cả)
    groupIdMap: new Map(),      // zalo_group_id → canonical group_id (khi 2 account có ID khác nhau)
    groupNameById: new Map(),
    claims: new Map(),          // `${groupId}:${ownerId}` -> {savedId, msgId, text}
    rawMsgById: new Map(),      // msgId -> object message gốc (để reply đúng tin)
    sentOks: new Map(),         // msgId cuốc -> {groupId, sent, savedId} (để thu hồi khi huỷ)
    tripMsgCache: new Map(),    // msgId → {type, price, senderId} — cuốc gần đây (barem tracking)
    claimCache: new Map(),      // claimMsgId → {tripPosterId, takerId, takerName, tripType, tripPrice}
    onEvent,
    lastMsgAt: Date.now(),      // timestamp tin nhắn cuối (để phát hiện session chết)
    isAccountant: false,        // set sau khi getUserPublic
    cookieSaveTimer: null,      // interval lưu cookies định kỳ
  };
  // Đánh dấu role để onMessage biết có thu thập member hay không
  // Dùng await (hoạt động với cả SQLite sync và PostgreSQL async)
  ;(async () => { try { const u = await dbm.getUserPublic(userId); if (u?.role === "accountant") sess.isAccountant = true; } catch {} })();
  sessions.set(userId, sess);

  api.listener.on("message", (msg) => { sess.lastMsgAt = Date.now(); onMessage(sess, msg); });

  // Lưu cookies định kỳ mỗi 20 phút để giữ phiên qua các lần restart
  sess.cookieSaveTimer = setInterval(() => {
    persistCookies(userId, api).catch(e => console.warn(`[${userId}] periodic cookie save:`, e?.message || e));
  }, 20 * 60 * 1000);

  // Khi listener gặp lỗi hoặc bị đóng → thử tự reconnect
  let recovering = false;
  const handleDead = async (reason) => {
    if (recovering || !sessions.has(userId)) return;
    recovering = true;
    clearInterval(sess.cookieSaveTimer);
    console.warn(`[${userId}] Zalo listener chết (${reason}), thử kết nối lại…`);
    // Lưu cookies mới nhất trước khi tắt session (có thể đã được Zalo refresh)
    await persistCookies(userId, api).catch(() => {});
    sessions.delete(userId);
    try {
      await sleep(3000);
      await startSessionFromStored(userId, onEvent);
      console.log(`[${userId}] Zalo tự kết nối lại thành công`);
    } catch (e) {
      console.error(`[${userId}] Không tự kết nối lại được:`, e?.message || e);
      onEvent(userId, { type: "zalo_expired" });
    }
  };

  api.listener.on("error", (e) => {
    console.error(`[${userId}] listener error:`, e?.message || e);
    handleDead("error");
  });
  // zca-js có thể emit "close" hoặc "disconnect" tùy phiên bản
  try { api.listener.on("close", () => handleDead("close")); } catch {}
  try { api.listener.on("disconnect", () => handleDead("disconnect")); } catch {}

  api.listener.start();

  loadGroups(sess).catch(e => console.error(`[${userId}] loadGroups:`, e?.message || e));
  return sess;
}

// Kiểm tra định kỳ: nếu session im lặng > 30 phút → thử ping bằng getGroupList
// (Zalo thường có tin nhóm mỗi vài phút nếu session còn sống)
setInterval(async () => {
  const STALE_MS = 30 * 60 * 1000;
  for (const [userId, sess] of sessions.entries()) {
    if (Date.now() - sess.lastMsgAt < STALE_MS) continue;
    try {
      await sess.api.getAllGroups();
      sess.lastMsgAt = Date.now(); // ping thành công → session còn sống
      persistCookies(userId, sess.api).catch(() => {}); // refresh cookies sau ping
    } catch (e) {
      console.warn(`[${userId}] Ping Zalo thất bại, session có thể đã chết:`, e?.message || e);
      sessions.delete(userId);
      try {
        await startSessionFromStored(userId, sess.onEvent);
        console.log(`[${userId}] Zalo tự phục hồi sau ping thất bại`);
      } catch {
        sess.onEvent(userId, { type: "zalo_expired" });
      }
    }
  }
}, 15 * 60 * 1000); // kiểm tra mỗi 15 phút

// Lấy canonical group_id cho DB (map zalo_group_id → canonical nếu có)
function resolveGroupId(sess, zaloGroupId) {
  return sess.groupIdMap.get(zaloGroupId) || zaloGroupId;
}

// Bắt kịp tin nhắn bị bỏ sót trong thời gian service down
// Lấy 100 tin gần nhất từ Zalo, so sánh với raw_messages, xử lý những tin chưa có
async function catchUpMissedMessages(sess, zaloGroupId) {
  try {
    const result = await sess.api.getGroupChatHistory(zaloGroupId, 100);
    const msgs = (result?.groupMsgs || []);
    // Sort cũ → mới để xử lý đúng thứ tự
    msgs.sort((a, b) => Number(a.data?.ts || a.data?.createTime || 0) - Number(b.data?.ts || b.data?.createTime || 0));
    let count = 0;
    for (const msg of msgs) {
      const rawMsgId = msg.data?.msgId || msg.data?.cliMsgId;
      if (!rawMsgId) continue;
      const already = await Promise.resolve(dbm.hasRawMessage(String(rawMsgId)));
      if (already) continue;
      // Chưa xử lý → đưa vào onMessage (sẽ lưu raw + process + dedup)
      onMessage(sess, msg);
      await sleep(30); // nhường event loop giữa các tin
      count++;
    }
    if (count > 0) console.log(`[${sess.userId}] ↩️  Catchup ${zaloGroupId}: xử lý ${count} tin bị bỏ sót`);
  } catch (e) {
    console.warn(`[${sess.userId}] catchup ${zaloGroupId}:`, e?.message || e);
  }
}

async function loadGroups(sess) {
  const { api } = sess;
  const res = await api.getAllGroups();
  const ids = res?.gridVerMap ? Object.keys(res.gridVerMap)
    : Array.isArray(res) ? res : Object.keys(res || {});
  sess.groups = [];

  // Parallel getGroupInfo (5 nhóm/lần) — không để tuần tự lock event loop
  const CHUNK = 5;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map(async (id) => {
      let name = id, link = null;
      try {
        const info = await api.getGroupInfo(id);
        const g = info?.gridInfoMap?.[id] || info?.[id] || info;
        name = g?.name || g?.groupName || id;
        link = g?.linkJoin || g?.link || g?.inviteLink || null;
      } catch {}
      return { id, name, link };
    }));
    for (const r of results) {
      if (r.status === "fulfilled") {
        const { id, name, link } = r.value;
        sess.groupNameById.set(id, name);
        sess.groups.push({ id, name, link });
      }
    }
    await yieldLoop(); // nhường event loop giữa các batch
  }

  sess.onEvent(sess.userId, { type: "groups", groups: sess.groups, selected: [...sess.selected] });

  // Sau khi gọi nhiều Zalo API (getAllGroups + getGroupInfo), cookies đã được refresh → lưu lại
  persistCookies(sess.userId, sess.api).catch(() => {});

  // Khôi phục groupIdMap và auto-import thành viên (dành cho kế toán)
  try {
    const u = await dbm.getUserPublic(sess.userId);
    if (u?.role === "accountant") {
      const acctGroups = await dbm.getAccountantGroups(sess.userId);
      for (const ag of acctGroups) {
        // Khôi phục mapping zalo_group_id → canonical group_id
        if (ag.zalo_group_id && ag.zalo_group_id !== ag.group_id) {
          sess.groupIdMap.set(ag.zalo_group_id, ag.group_id);
        }
        // Auto-import chỉ khi chưa có thành viên
        const zaloId = ag.zalo_group_id || ag.group_id;
        const cnt = await dbm.countMembers(ag.group_id);
        if (cnt === 0) importGroupMembers(sess, zaloId, ag.group_id).catch(() => {});
      }
      // Cập nhật sess.selected từ DB (dùng zalo_group_id để Zalo nhận đúng message)
      sess.selected = new Set(acctGroups.map(ag => ag.zalo_group_id || ag.group_id));

      // Bắt kịp tin nhắn bị bỏ sót (sau downtime/restart)
      // Delay nhỏ để listener ổn định trước khi gọi API lịch sử
      await sleep(3000);
      for (const ag of acctGroups) {
        const zaloId = ag.zalo_group_id || ag.group_id;
        catchUpMissedMessages(sess, zaloId).catch(() => {});
        await sleep(500); // stagger để không spam Zalo API
      }
    }
  } catch {}
}

// Ánh xạ parseType (parser output) → barem type codes (lưu trong DB từ BaremTab)
const PARSER_TO_BAREM = {
  "Bao xe":          ["bao_xe"],
  "Bao xe 2 chiều":  ["bao_xe_2c"],
  "Ghép 1":          ["ghep_1"],
  "Ghép 2":          ["ghep_2"],
  "Hàng":            ["ship"],
  "Sân bay đón":     ["san_bay_don"],
  "Sân bay tiễn":    ["san_bay_tien"],
  "Sân bay 2 chiều": ["san_bay_2c"],
  "Sân bay":         ["san_bay_don", "san_bay_tien", "san_bay_2c"], // fallback khi không detect được
};

function calcBaremPoints(rulesRow, parserType, price) {
  if (!rulesRow?.rules_json) return 0;
  let parsed;
  try { parsed = JSON.parse(rulesRow.rules_json); } catch { return 0; }
  const rules = Array.isArray(parsed) ? parsed : (parsed?.rules || []);
  if (!rules.length) return 0;

  const targetCodes = PARSER_TO_BAREM[parserType] || [];

  const matchRule = (rule) => {
    const lo = Number(rule.min ?? rule.priceFrom ?? rule.from ?? 0);
    const hi = Number(rule.max ?? rule.priceTo ?? rule.to ?? Infinity);
    return price >= lo && price <= hi ? Number(rule.points || 0) : null;
  };

  // Tìm rule khớp chính xác loại cuốc
  for (const rule of rules) {
    if (!targetCodes.includes((rule.type || "").toLowerCase())) continue;
    const pts = matchRule(rule);
    if (pts !== null) return pts;
  }
  // Fallback "khac" nếu không khớp loại nào
  for (const rule of rules) {
    if ((rule.type || "").toLowerCase() !== "khac") continue;
    const pts = matchRule(rule);
    if (pts !== null) return pts;
  }
  return 0;
}

async function onMessage(sess, msg) {
  try {
    const isGroup = msg?.type === 1 || (msg?.threadId && String(msg.threadId).length > 15);
    if (!isGroup) return;
    const groupId = String(msg.threadId);
    if (sess.selected.size > 0 && !sess.selected.has(groupId)) return;
    // dbGroupId: canonical ID để dùng trong DB (có thể khác groupId nếu 2 Zalo account có ID khác nhau)
    const dbGroupId = resolveGroupId(sess, groupId);

    const senderId = String(msg.data?.uidFrom || msg.data?.senderId || "");
    const senderName = msg.data?.dName || "Không rõ";
    const msgId = String(msg.data?.msgId || msg.data?.cliMsgId || Date.now());
    const groupName = sess.groupNameById.get(groupId) || msg.data?.groupName || groupId;
    const time = new Date().toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

    // DEBUG: log tin media để xác định cấu trúc voice thật của zca-js
    if (process.env.DEBUG_RAW && typeof msg.data?.content !== "string") {
      console.log(`[DEBUG_RAW] group=${groupId} msgType=${msg.data?.msgType}`,
        JSON.stringify(msg.data?.content)?.slice(0, 600));
    }

    // Phát hiện tin nhắn voice → dịch bất đồng bộ, không chặn listener
    const voiceUrl = getVoiceUrl(msg.data?.content, msg.data);
    if (voiceUrl) {
      if (config.voiceEnabled) {
        cacheRawMsg(sess, msgId, msg);
        handleVoiceTrip(sess, { groupId, groupName, senderId, senderName, msgId, time }, msg, voiceUrl)
          .catch(e => console.error(`[${sess.userId}] voice trip:`, e?.message || e));
      }
      return; // bỏ qua voice nếu tính năng tắt (không xử lý như text)
    }

    const text = typeof msg.data?.content === "string" ? msg.data.content : (msg.data?.content?.title || "");
    const msgTs = Number(msg.data?.ts || msg.data?.createTime || msg.data?.serverTime || Date.now());
    const msgType = Number(msg.data?.msgType || 0);

    // Lưu raw message (audit log + anti-cheat + catchup sau downtime)
    // msg.data?.msgId thường là globalMsgId; cliMsgId là ID client — cả hai đã có trong msgId ở trên
    const rawMsgId = msg.data?.msgId || msg.data?.cliMsgId;
    if (rawMsgId) {
      Promise.resolve(dbm.saveRawMessage(String(rawMsgId), groupId, senderId, senderName, text, msgType, msgTs)).catch(() => {});
    }

    // Thu thập thành viên thụ động: mỗi tin nhắn trong nhóm được theo dõi → lưu sender
    if (senderId && sess.isAccountant) {
      Promise.resolve(dbm.upsertMember(dbGroupId, senderId, { display_name: senderName !== "Không rõ" ? senderName : null }))
        .catch(() => {});
      // Lưu cả những người bị tag trong tin nhắn (kể cả khi họ chưa chat lần nào)
      const mentioned = msg.data?.mentions || [];
      for (const mn of mentioned) {
        const uid = String(mn.uid);
        const name = mn.display_name || mn.dName || null;
        if (uid && uid !== String(sess.selfId)) {
          Promise.resolve(dbm.upsertMember(dbGroupId, uid, { display_name: name || undefined })).catch(() => {});
        }
      }
    }

    // (A.0) San điểm: ai đó tag kế toán + "san" + số điểm → tạo pending transfer
    if (senderId !== String(sess.selfId)) {
      const sanResults = detectSanDiem(text, msg.data?.mentions || [], sess.selfId);
      if (sanResults.length > 0) {
        for (const sr of sanResults) {
          if (!sr.toUid) continue;
          if (sr.toName) Promise.resolve(dbm.upsertMember(dbGroupId, sr.toUid, { display_name: sr.toName })).catch(() => {});
          Promise.resolve(dbm.createPendingTransfer(
            dbGroupId, senderId, sr.toUid, sr.amount, text, msgId
          )).then(txId => {
            sess.onEvent(sess.userId, {
              type: "pending_transfer", txId,
              groupId: dbGroupId, groupName,
              fromUid: senderId, fromName: senderName,
              toUid: sr.toUid, toName: sr.toName,
              points: sr.amount, rawText: text,
            });
          }).catch(e => console.error(`[${sess.userId}] san điểm:`, e?.message || e));
        }
        return;
      }
    }

    // (A.0b) KT tự gửi san: "San cho @A Xd @B Yd" — kế toán là người chuyển
    if (sess.isAccountant && senderId === String(sess.selfId) && /\bsan\b/i.test(text)) {
      const mentions = msg.data?.mentions || [];
      if (mentions.length > 0) {
        const sanResults = detectSanDiem(text, mentions, null);
        if (sanResults.length > 0) {
          for (const sr of sanResults) {
            if (!sr.toUid) continue;
            if (sr.toName) Promise.resolve(dbm.upsertMember(dbGroupId, sr.toUid, { display_name: sr.toName })).catch(() => {});
            Promise.resolve(dbm.createPendingTransfer(
              dbGroupId, senderId, sr.toUid, sr.amount, text, msgId
            )).then(txId => {
              sess.onEvent(sess.userId, {
                type: "pending_transfer", txId,
                groupId: dbGroupId, groupName,
                fromUid: senderId, fromName: senderName,
                toUid: sr.toUid, toName: sr.toName || "",
                points: sr.amount, rawText: text,
              });
            }).catch(e => console.error(`[${sess.userId}] san điểm (self):`, e?.message || e));
          }
          return;
        }
      }
    }

    // (A.0a / A.0c / A.1) San điểm trong nhóm kế toán
    // A.0a: Tài xế tag chỉ KT → tài xế bán/tặng điểm ngược cho KT ("San @KT 15d")
    // A.0c: Chính KT nhóm gửi lệnh san trực tiếp cho người khác
    // A.1 : Người khác tag KT + người nhận trong cùng tin
    if (sess.isAccountant && senderId !== String(sess.selfId) && /\bsan\b/i.test(text)) {
      const mentions = msg.data?.mentions || [];
      if (mentions.length > 0) {
        Promise.resolve((async () => {
          const ktUid = await dbm.getGroupKtUid(dbGroupId);
          // Tập hợp tất cả UID được coi là "kế toán" (bot session + KT thật của nhóm)
          const ktUids = new Set([String(sess.selfId)]);
          if (ktUid) ktUids.add(String(ktUid));

          // A.0c: Chính KT nhóm gửi san → tất cả mentions là người nhận
          if (ktUid && String(ktUid) === String(senderId)) {
            const sanResults = detectSanDiem(text, mentions, null);
            for (const sr of sanResults) {
              if (!sr.toUid) continue;
              if (sr.toName) Promise.resolve(dbm.upsertMember(dbGroupId, sr.toUid, { display_name: sr.toName })).catch(() => {});
              const txId = await dbm.createPendingTransfer(dbGroupId, senderId, sr.toUid, sr.amount, text, msgId);
              console.log(`[${sess.userId}] 📋 KT san: ${senderId} → ${sr.toUid} ${sr.amount}đ nhóm=${dbGroupId}`);
              sess.onEvent(sess.userId, {
                type: "pending_transfer", txId, groupId: dbGroupId, groupName,
                fromUid: senderId, fromName: senderName,
                toUid: sr.toUid, toName: sr.toName || "", points: sr.amount, rawText: text,
              });
            }
            return;
          }

          // A.0a: Tất cả mentions đều là KT → tài xế trả/bán điểm cho KT
          const allToKT = mentions.every(mn => ktUids.has(String(mn.uid)));
          if (allToKT) {
            const amountRe = /(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|d)(?!\w)/gi;
            let m; const amounts = [];
            while ((m = amountRe.exec(text)) !== null) {
              const val = parseFloat(m[1].replace(",", "."));
              if (val > 0 && val <= 20) amounts.push(val);
            }
            if (!amounts.length) return;
            const toM = mentions[0];
            const toMName = toM.display_name || toM.dName || "";
            if (toMName) Promise.resolve(dbm.upsertMember(dbGroupId, String(toM.uid), { display_name: toMName })).catch(() => {});
            const txId = await dbm.createPendingTransfer(dbGroupId, senderId, String(toM.uid), amounts[0], text, msgId);
            console.log(`[${sess.userId}] 💰 Driver→KT san: ${senderId} → ${toM.uid} ${amounts[0]}đ nhóm=${dbGroupId}`);
            sess.onEvent(sess.userId, {
              type: "pending_transfer", txId, groupId: dbGroupId, groupName,
              fromUid: senderId, fromName: senderName,
              toUid: String(toM.uid), toName: toM.display_name || toM.dName || "",
              points: amounts[0], rawText: text,
            });
            return;
          }

          // A.1: Người khác tag KT + người nhận (ktUid khác sess.selfId)
          if (!ktUid || ktUid === String(sess.selfId)) return;
          if (mentions.length >= 2) {
            const sanResults = detectSanDiem(text, mentions, ktUid);
            for (const sr of sanResults) {
              if (!sr.toUid) continue;
              if (sr.toName) Promise.resolve(dbm.upsertMember(dbGroupId, sr.toUid, { display_name: sr.toName })).catch(() => {});
              const txId = await dbm.createPendingTransfer(dbGroupId, senderId, sr.toUid, sr.amount, text, msgId);
              console.log(`[${sess.userId}] 📋 Pending san: ${senderId} → ${sr.toUid} ${sr.amount}đ nhóm=${dbGroupId}`);
              sess.onEvent(sess.userId, {
                type: "pending_transfer", txId, groupId: dbGroupId, groupName,
                fromUid: senderId, fromName: senderName,
                toUid: sr.toUid, toName: sr.toName || "", points: sr.amount, rawText: text,
              });
            }
          }
        })()).catch(e => console.error(`[${sess.userId}] auto-san:`, e?.message || e));
      }
    }

    // (A) chủ cuốc xác nhận cho mình?
    const key = `${groupId}:${senderId}`;
    if (sess.claims.has(key) && isConfirmMessage(text) && isTaggingSelf(sess, msg)) {
      const c = sess.claims.get(key);
      sess.claims.delete(key);
      Promise.resolve(dbm.markTripWon(c.savedId)).catch(()=>{});
      sess.onEvent(sess.userId, { type: "won", groupId, group: groupName, msgId: c.msgId, text: c.text });
      return;
    }

    // (C) Kế toán: phát hiện người nhận cuốc reply "Ok" quoting trip → lưu claim
    if (sess.isAccountant && senderId !== String(sess.selfId)) {
      const qd = msg.data?.quote;
      if (qd && isClaimMessage(text)) {
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CLAIM] from=${senderId} quote=`, JSON.stringify(qd)?.slice(0, 300));
        const quoteOwnerId = String(qd.ownerId || "");
        // TQuote không có msgId — chỉ có cliMsgId (number) và globalMsgId (number)
        const qCliId = qd.cliMsgId != null ? String(qd.cliMsgId) : "";
        const qGlobId = qd.globalMsgId != null ? String(qd.globalMsgId) : "";
        const cachedTrip = sess.tripMsgCache.get(qCliId) || (qGlobId ? sess.tripMsgCache.get(qGlobId) : null);
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CLAIM] quoteOwnerId=${quoteOwnerId} cliMsgId=${qCliId} globalMsgId=${qGlobId} tripFound=${!!cachedTrip}`);
        if (cachedTrip && quoteOwnerId && quoteOwnerId !== senderId) {
          // Điểm thỏa thuận ngay trong tin ok (vd: "@A ok 2đ dbcl") > điểm explicit trong tin đăng > barem
          const claimNegotiatedPts = parseBonus(text) || 0;
          if (claimNegotiatedPts > 0) console.log(`[${sess.userId}] 💬 Claim thỏa thuận: ${claimNegotiatedPts}đ từ "${text.slice(0,50)}"`);
          const claimData = {
            tripPosterId: cachedTrip.senderId, tripPosterName: cachedTrip.senderName,
            takerId: senderId, takerName: senderName,
            tripType: cachedTrip.type, tripPrice: cachedTrip.price,
            tripText: cachedTrip.text, tripTime: cachedTrip.time,
            claimText: text, claimTime: time,
            explicitPoints: claimNegotiatedPts || cachedTrip.explicitPoints || 0,
            pointSource: claimNegotiatedPts > 0 ? "claim" : (cachedTrip.explicitPoints > 0 ? "trip" : "barem"),
          };
          sess.claimCache.set(msgId, claimData);
          if (msg.data.cliMsgId) sess.claimCache.set(String(msg.data.cliMsgId), claimData);
          while (sess.claimCache.size > 100)
            sess.claimCache.delete(sess.claimCache.keys().next().value);
        }
      }
    }

    // (D) Kế toán: chủ cuốc xác nhận "ok ib" cho người nhận → áp dụng barem
    if (sess.isAccountant && senderId !== String(sess.selfId) && isConfirmMessage(text)) {
      const qd = msg.data?.quote;
      if (qd) {
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CONFIRM] from=${senderId} quote=`, JSON.stringify(qd)?.slice(0, 300));
        const qCliId2  = qd.cliMsgId != null ? String(qd.cliMsgId) : "";
        const qGlobId2 = qd.globalMsgId != null ? String(qd.globalMsgId) : "";
        const cachedClaim = sess.claimCache.get(qCliId2) || (qGlobId2 ? sess.claimCache.get(qGlobId2) : null);
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CONFIRM] cliMsgId=${qCliId2} globalMsgId=${qGlobId2} claimFound=${!!cachedClaim} posterMatch=${cachedClaim?.tripPosterId === senderId}`);
        if (cachedClaim && senderId === cachedClaim.tripPosterId) {
          sess.claimCache.delete(qCliId2);
          if (qGlobId2) sess.claimCache.delete(qGlobId2);
          Promise.resolve((async () => {
            const rulesRow = await dbm.getRules(dbGroupId);
            const baremPts = calcBaremPoints(rulesRow, cachedClaim.tripType, cachedClaim.tripPrice);
            const pts = cachedClaim.explicitPoints > 0 ? cachedClaim.explicitPoints : baremPts;
            const ptsSrc = cachedClaim.pointSource === "claim" ? "(thỏa thuận trong tin ok)" : cachedClaim.pointSource === "trip" ? "(explicit từ tin đăng)" : `rules=${rulesRow ? "ok" : "null"}`;
            console.log(`[${sess.userId}] 📊 Barem confirm: type=${cachedClaim.tripType} price=${cachedClaim.tripPrice}k pts=${pts} ${ptsSrc}`);
            if (pts > 0) {
              const convo = JSON.stringify({
                tripTime: cachedClaim.tripTime, tripPoster: cachedClaim.tripPosterName, tripText: cachedClaim.tripText,
                claimTime: cachedClaim.claimTime, claimer: cachedClaim.takerName, claimText: cachedClaim.claimText,
                confirmTime: time, confirmPoster: senderName, confirmText: text,
              });
              await dbm.adjustPoints(dbGroupId, cachedClaim.tripPosterId,  pts, "Đăng cuốc thành công", "barem", msgId, null, cachedClaim.tripPosterId, convo);
              await dbm.adjustPoints(dbGroupId, cachedClaim.takerId,      -pts, "Nhận cuốc xe",         "barem", msgId, cachedClaim.takerId, null, convo);
              console.log(`[${sess.userId}] ✅ Barem applied: +${pts}đ → ${cachedClaim.tripPosterId}, -${pts}đ → ${cachedClaim.takerId}`);
            } else {
              console.warn(`[${sess.userId}] ⚠️  Barem pts=0 — chưa có rule cho ${cachedClaim.tripType} ${cachedClaim.tripPrice}k`);
            }
          })()).catch(e => console.error(`[${sess.userId}] barem apply:`, e?.message || e));
        }
      }
    }

    // (E) Kế toán: @kế toán + từ khóa trong reply → điều chỉnh / hủy giao dịch barem
    // TH1: "lịch -+N @kế toán" → thỏa thuận điểm mới
    // TH2: "lịch hủy @kế toán"  → đảo ngược hoàn toàn
    // TH3: "lịch free @kế toán" → không tính điểm, đảo ngược
    if (sess.isAccountant && senderId !== String(sess.selfId)) {
      const qd = msg.data?.quote;
      const mentions = msg.data?.mentions || [];
      if (qd && mentions.some(m => String(m.uid) === String(sess.selfId))) {
        const action = detectBaremAction(text);
        if (action) {
          const qGlobId = qd.globalMsgId != null ? String(qd.globalMsgId) : "";
          const qCliId  = qd.cliMsgId   != null ? String(qd.cliMsgId)   : "";
          Promise.resolve((async () => {
            let txs = [];
            if (qGlobId) txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, qGlobId));
            if (!txs.length && qCliId) txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, qCliId));
            if (!txs.length) {
              console.warn(`[${sess.userId}] (E) barem ${action.type}: không tìm thấy tx cho quoted glob=${qGlobId} cli=${qCliId}`);
              return;
            }
            // Phân biệt poster (to_member không null) và taker (from_member không null)
            const posterTx = txs.find(t => t.to_member && !t.from_member);
            const takerTx  = txs.find(t => t.from_member && !t.to_member);
            if (!posterTx || !takerTx) {
              console.warn(`[${sess.userId}] (E) barem ${action.type}: không phân biệt poster/taker từ ${txs.length} tx`);
              return;
            }
            const posterUid   = posterTx.to_member;
            const takerUid    = takerTx.from_member;
            const originalPts = Number(posterTx.points);

            // Giữ nội dung convo gốc + thêm tin hành động
            let baseConvo = null;
            try { baseConvo = posterTx.raw_text ? JSON.parse(posterTx.raw_text) : null; } catch {}

            // Lấy toàn bộ tin nhắn trong nhóm từ trước khi cuốc được đăng đến tin hủy/điều chỉnh
            // Window 4h trước thời điểm barem được áp dụng → đủ bao gồm tin đăng cuốc
            const WINDOW_MS = 4 * 60 * 60 * 1000;
            let rawLog = "";
            try {
              const rawMsgs = await Promise.resolve(
                dbm.listRawMessages(dbGroupId, {
                  dateFrom: posterTx.created_at - WINDOW_MS,
                  dateTo: msgTs + 1000,
                  limit: 200,
                })
              );
              rawLog = rawMsgs
                .filter(m => m.text)
                .map(m => ({
                  msgId: m.msg_id,
                  uid:   m.sender_id,
                  name:  m.sender_name || "",
                  ts:    m.created_at,
                  text:  m.text,
                }));
            } catch {}

            const reversalConvo = JSON.stringify({
              ...(baseConvo || {}),
              cancelTime: time, canceller: senderName, cancelText: text,
              rawLog,
            });

            if (action.type === 'cancel') {
              await dbm.adjustPoints(dbGroupId, posterUid, -originalPts, 'Hủy lịch', 'barem_cancel', msgId, null, null, reversalConvo);
              await dbm.adjustPoints(dbGroupId, takerUid,  +originalPts, 'Hủy lịch', 'barem_cancel', msgId, null, null, reversalConvo);
              console.log(`[${sess.userId}] ❌ Barem cancel: ±${originalPts}đ | poster=${posterUid} taker=${takerUid}`);
            } else if (action.type === 'free') {
              await dbm.adjustPoints(dbGroupId, posterUid, -originalPts, 'Lịch free', 'barem_cancel', msgId, null, null, reversalConvo);
              await dbm.adjustPoints(dbGroupId, takerUid,  +originalPts, 'Lịch free', 'barem_cancel', msgId, null, null, reversalConvo);
              console.log(`[${sess.userId}] 🆓 Barem free: ±${originalPts}đ | poster=${posterUid} taker=${takerUid}`);
            } else if (action.type === 'adjust') {
              const diff = action.points - originalPts;
              if (diff === 0) return;
              const reason = `Thỏa thuận: ${originalPts}đ → ${action.points}đ`;
              await dbm.adjustPoints(dbGroupId, posterUid,  diff, reason, 'barem_adjust', msgId, null, null, reversalConvo);
              await dbm.adjustPoints(dbGroupId, takerUid,  -diff, reason, 'barem_adjust', msgId, null, null, reversalConvo);
              console.log(`[${sess.userId}] 📝 Barem adjust: ${originalPts}→${action.points}đ diff=${diff} | poster=${posterUid} taker=${takerUid}`);
            }
          })()).catch(e => console.error(`[${sess.userId}] barem action (E):`, e?.message || e));
          return;
        }
      }
    }

    // (B) cuốc mới — 1 tin có thể chứa nhiều cuốc
    const mode = config.parseMode || "regex";
    const hasAIKey = !!(config.groqApiKey || config.geminiApiKey);

    // Bước 1: Regex (bỏ qua nếu mode==="ai")
    let trips = (mode !== "ai")
      ? parseMultipleTrips({ groupId, groupName, senderId, senderName, msgId, text, time })
      : [];

    // Bước 2: AI (chỉ khi mode!=="regex" và có key)
    if (mode !== "regex" && hasAIKey) {
      const needFallback = trips.length === 0;
      const needEnrich = trips.length > 0 && trips.some(t => !t.route || t.route.from === "?" || t.route.to === "?");
      if (needFallback || needEnrich) {
        try {
          const ai = await parseWithAI(text, msgId);
          if (needFallback) {
            const t = aiToTrip(ai, { groupId, groupName, senderId, senderName, msgId, time, text });
            if (t) { trips = [t]; console.log(`[${sess.userId}] 🤖 AI new: ${t.type} ${t.price}k ${t.route?.from}→${t.route?.to}`); }
          } else if (needEnrich && ai?.isTrip && (ai.from || ai.to)) {
            trips = trips.map(t => (!t.route || (t.route.from === "?" && t.route.to === "?")) ? {
              ...t,
              route: { from: ai.from || "?", to: ai.to || "?" },
              tripType: ai.tripType || t.tripType || null,
            } : t);
            console.log(`[${sess.userId}] 🤖 AI enrich: ${ai.from}→${ai.to} (${ai.tripType})`);
          }
        } catch (e) {
          console.warn(`[${sess.userId}] AI parse lỗi: ${e?.message || e}`);
        }
      }
    }

    if (trips.length > 0) {
      cacheRawMsg(sess, msgId, msg);
      // Kế toán: lưu cuốc vào tripMsgCache để (C) phát hiện claim sau
      if (sess.isAccountant) {
        for (const trip of trips) {
          if (!trip.price) continue;
          const tripData = { type: trip.type, price: trip.price, senderId: trip.senderId, senderName, text, time, explicitPoints: trip.explicitPoints || 0 };
          // Lưu bằng cả msgId (server) và cliMsgId (client) để quote lookup khớp
          sess.tripMsgCache.set(msgId, tripData);
          if (msg.data.cliMsgId) sess.tripMsgCache.set(String(msg.data.cliMsgId), tripData);
          while (sess.tripMsgCache.size > 100)
            sess.tripMsgCache.delete(sess.tripMsgCache.keys().next().value);
        }
      }
      const rulesRow = await getBaremRulesCached(dbGroupId);
      for (let i = 0; i < trips.length; i++) {
        const subMsgId = trips.length === 1 ? msgId : `${msgId}_${i}`;
        const tripOut = { ...trips[i], msgId: subMsgId };
        if (trips.length > 1) {
          tripOut.replyMsgId = msgId; // reply về tin gốc chứa tất cả cuốc
          sess.rawMsgById.set(subMsgId, msg);
        }
        // Ước tính điểm theo barem (hiển thị ~ trên TripCard tài xế)
        if (trips[i].price > 0 && !trips[i].free) {
          const est = calcBaremPoints(rulesRow, trips[i].type, trips[i].price);
          console.log(`[estPts] grp=${dbGroupId} type="${trips[i].type}" price=${trips[i].price} rules=${rulesRow ? "OK" : "null"} est=${est}`);
          if (est > 0) tripOut.estPts = est;
        }
        sess.onEvent(sess.userId, { type: "trip", trip: tripOut });
      }
    }
  } catch (e) {
    console.error(`[${sess.userId}] onMessage:`, e?.message || e);
  }
}

// Lưu rawMsg vào cache (giới hạn 30 tin)
function cacheRawMsg(sess, msgId, msg) {
  sess.rawMsgById.set(msgId, msg);
  if (sess.rawMsgById.size > 30) {
    const firstKey = sess.rawMsgById.keys().next().value;
    sess.rawMsgById.delete(firstKey);
  }
}

// Dịch voice → text → parseTrip → gửi event (chạy nền)
async function handleVoiceTrip(sess, base, rawMsg, voiceUrl) {
  const text = await transcribeVoice(voiceUrl, base.msgId);
  if (!text) return;
  console.log(`[${sess.userId}] 🎤 voice "${text.slice(0, 80)}"`);
  const trips = parseMultipleTrips({ ...base, text });
  if (trips.length === 0) return;
  const rulesRow = await getBaremRulesCached(resolveGroupId(sess, base.groupId));
  for (let i = 0; i < trips.length; i++) {
    const subMsgId = trips.length === 1 ? base.msgId : `${base.msgId}_${i}`;
    const tripOut = { ...trips[i], msgId: subMsgId, isVoice: true };
    if (trips.length > 1) {
      tripOut.replyMsgId = base.msgId;
      sess.rawMsgById.set(subMsgId, rawMsg);
    }
    if (trips[i].price > 0 && !trips[i].free) {
      const est = calcBaremPoints(rulesRow, trips[i].type, trips[i].price);
      if (est > 0) tripOut.estPts = est;
    }
    sess.onEvent(sess.userId, { type: "trip", trip: tripOut });
  }
}

// Chuẩn hoá tiếng Việt về ASCII lowercase (dùng để match pattern không dấu)
function noMarkLower(s) {
  return (s || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Phát hiện hành động điều chỉnh barem từ tin "@kế toán" reply
// Trả về {type: 'cancel'|'free'|'adjust', points?: number} hoặc null
function detectBaremAction(text) {
  if (!text) return null;
  const t = noMarkLower(text);
  // "lịch hủy" / "hủy lịch" / "lich huy" / "huy lich"
  if (/lich\s*hu[y]?|hu[y]?\s*lich/.test(t)) return { type: 'cancel' };
  // "lịch free" / "lich free"
  if (/lich\s*free/.test(t)) return { type: 'free' };
  // "lịch N" / "lịch +N" / "lịch -+N" — N là số điểm thỏa thuận mới
  const adj = t.match(/lich[\s:]*[-+]*\s*(\d+(?:[.,]\d+)?)\s*(?:d(?:iem)?)?(?=[\s,.]|$)/);
  if (adj) {
    const pts = parseFloat(adj[1].replace(',', '.'));
    if (pts > 0 && pts <= 20) return { type: 'adjust', points: pts };
  }
  return null;
}

// Phát hiện "san điểm" — trả về Array<{amount, toUid, toName}>
// selfUid: UID kế toán cần được tag (null = không yêu cầu, dùng khi KT tự gửi)
function detectSanDiem(text, mentions, selfUid) {
  if (!/\bsan\b/i.test(text)) return [];
  const selfStr = selfUid ? String(selfUid) : null;
  if (selfStr && !mentions.some(m => String(m.uid) === selfStr)) return [];
  const recipients = selfStr
    ? mentions.filter(mn => String(mn.uid) !== selfStr)
    : [...mentions];
  if (!recipients.length) return [];
  // Trích tất cả số điểm theo thứ tự xuất hiện
  const amounts = [];
  const amountRe = /(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|d)(?!\w)/gi;
  let m;
  while ((m = amountRe.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(",", "."));
    if (val > 0 && val <= 20) amounts.push(val);
  }
  if (!amounts.length) return [];
  return recipients.map((recv, i) => ({
    amount: amounts.length === 1 ? amounts[0] : (amounts[i] ?? amounts[amounts.length - 1]),
    toUid: recv.uid || null,
    toName: recv.display_name || recv.dName || null,
  }));
}

function isTaggingSelf(sess, msg) {
  const q = msg.data?.quote?.ownerId || msg.data?.quote?.uidFrom;
  if (q && String(q) === String(sess.selfId)) return true;
  const mentions = msg.data?.mentions || [];
  if (Array.isArray(mentions) && mentions.some(m => String(m.uid) === String(sess.selfId))) return true;
  return false;
}

// Trích member list từ response getGroupInfo
// GroupInfo thực tế có: currentMems=[{id,dName,zaloName,...}], memberIds=[uid,...]
function extractMemberList(info, groupId) {
  // Tìm đúng GroupInfo object trong gridInfoMap
  let g = info?.gridInfoMap?.[groupId];
  if (!g && info?.gridInfoMap) {
    // Zalo đôi khi trả groupId dạng số, thử tất cả values
    g = Object.values(info.gridInfoMap)[0];
  }

  if (g) {
    // currentMems có đủ thông tin: id + dName (display name)
    if (g.currentMems?.length) {
      const result = [...g.currentMems];
      // Luôn merge memberIds để không bỏ sót — kể cả khi hasMoreMember=0
      if (g.memberIds?.length) {
        const seenIds = new Set(result.map(m => String(m.id)));
        for (const uid of g.memberIds) {
          if (!seenIds.has(String(uid))) result.push({ id: String(uid) });
        }
      }
      return result;
    }
    // Fallback: chỉ có UIDs (không có tên)
    if (g.memberIds?.length) return g.memberIds.map(uid => ({ id: String(uid) }));
  }

  // Legacy fallbacks (các version cũ của zca-js hoặc format khác)
  if (info?.currentMems?.length) return info.currentMems;
  if (info?.memberIds?.length)   return info.memberIds.map(uid => ({ id: String(uid) }));
  if (info?.memberList?.length)  return info.memberList;
  if (info?.members?.length)     return info.members;
  return [];
}

// Import thành viên từ nhóm Zalo khi kế toán chọn nhóm
// zaloGroupId: ID Zalo dùng để gọi API; canonicalGroupId: ID dùng để lưu DB (có thể khác)
async function importGroupMembers(sess, zaloGroupId, canonicalGroupId = null) {
  const dbGroupId = canonicalGroupId || zaloGroupId;
  try {
    let memberList = [];
    const info = await sess.api.getGroupInfo(zaloGroupId);

    memberList = extractMemberList(info, zaloGroupId);

    // Fallback: thử các tên hàm khác nhau tuỳ phiên bản zca-js
    if (!memberList.length) {
      const tryMethods = ["getGroupMemberList", "fetchGroupMembers", "getGroupMembers"];
      for (const fn of tryMethods) {
        if (typeof sess.api[fn] !== "function") continue;
        try {
          const res = await sess.api[fn](zaloGroupId);
          memberList = Array.isArray(res) ? res : extractMemberList(res, zaloGroupId);
          if (memberList.length) { console.log(`[${sess.userId}] Dùng ${fn}() → ${memberList.length} member`); break; }
        } catch {}
      }
    }

    const g = info?.gridInfoMap?.[zaloGroupId] || Object.values(info?.gridInfoMap || {})[0];
    console.log(`[${sess.userId}] importGroupMembers ${zaloGroupId}→${dbGroupId}: ${memberList.length} thành viên`);

    let count = 0;
    for (const m of memberList) {
      const uid = m?.uid || m?.userId || m?.id;
      if (!uid) continue;
      const displayName = m.dName || m.displayName || m.name || null;
      await dbm.upsertMember(dbGroupId, String(uid), {
        display_name: displayName,
        avatar: m.avt || m.avatar || m.avatarUrl || null,
      });
      // Xóa thành viên tạm (~imp_*) cùng tên nếu vừa tìm được người thật
      if (displayName) await dbm.mergeTempMember(dbGroupId, displayName);
      count++;
      if (count % 10 === 0) await yieldLoop();
    }
    if (count) console.log(`[${sess.userId}] Đã lưu ${count} thành viên nhóm ${dbGroupId}`);
    if (sess.selfId) {
      await dbm.upsertMember(dbGroupId, String(sess.selfId), { display_name: sess.selfName || null });
    }
  } catch (e) {
    console.error(`[${sess.userId}] importGroupMembers ${zaloGroupId}→${dbGroupId}:`, e?.message || e);
  }
}

// ----- thao tác từ app -----
export async function setWatchedGroups(userId, groupIds) {
  const sess = sessions.get(userId); if (!sess) return;
  let ids = groupIds || [];

  try {
    const u = await dbm.getUserPublic(userId);
    if (u?.role === "accountant") {
      // Lock tạm thời tắt — kế toán tự do đổi nhóm
      // const locked = await dbm.isGroupsLocked(userId);
      // if (locked) { sess.onEvent(userId, { type: "groups_locked" }); return; }
      const limit = u.group_limit || 3;
      if (ids.length > limit) ids = ids.slice(0, limit);
      // Đồng bộ accountant_groups với lựa chọn hiện tại
      const current = await dbm.getAccountantGroups(userId);
      // currentZaloSet: IDs mà Zalo session này đang dùng (zalo_group_id hoặc group_id)
      const currentZaloSet = new Set(current.map(g => g.zalo_group_id || g.group_id));
      const currentCanonicalSet = new Set(current.map(g => g.group_id));

      const newZaloIds = ids.filter(gId => !currentZaloSet.has(gId) && !currentCanonicalSet.has(gId));
      // ids có thể bị thu hẹp nếu có nhóm bị từ chối (đã có kế toán khác theo dõi)
      const acceptedIds = [...ids];

      for (const gId of ids) {
        const alreadyTracked = currentZaloSet.has(gId) || currentCanonicalSet.has(gId);

        // Lấy canonicalId + groupName cho cả nhóm mới lẫn nhóm đã theo dõi
        let canonicalId = gId;
        let groupName = gId;
        if (!alreadyTracked) {
          const g = sess.groups.find(gr => gr.id === gId);
          groupName = g?.name || gId;
          const existing = await dbm.findGroupByName(groupName);
          canonicalId = (existing && existing.group_id !== gId) ? existing.group_id : gId;
        } else {
          const rec = current.find(g => (g.zalo_group_id || g.group_id) === gId || g.group_id === gId);
          if (rec) { canonicalId = rec.group_id; groupName = rec.group_name || gId; }
        }

        // Conflict: chỉ block khi session này CÓ Zalo (selfId set) VÀ nhóm đã có Zalo kế toán khác
        // Kế toán không có Zalo luôn được thêm nhóm để quản lý web bình thường
        if (sess.selfId) {
          const zaloOwner = await dbm.getGroupZaloOwner(canonicalId, userId);
          if (zaloOwner) {
            console.warn(`[${userId}] ⛔ Nhóm "${groupName}" đã có Zalo kế toán "${zaloOwner.name}" — từ chối Zalo monitor`);
            sess.onEvent(userId, {
              type: "group_conflict",
              groupId: gId,
              groupName,
              ownerName: zaloOwner.name || zaloOwner.accountant_id,
            });
            const idx = acceptedIds.indexOf(gId);
            if (idx !== -1) acceptedIds.splice(idx, 1);
            continue;
          }
        }

        if (!alreadyTracked) {
          if (canonicalId !== gId) {
            sess.groupIdMap.set(gId, canonicalId);
            console.log(`[${userId}] 🔗 Group alias: ${gId} → ${canonicalId} (tên: "${groupName}")`);
          }
          await dbm.addAccountantGroup(userId, canonicalId, groupName, canonicalId !== gId ? gId : null);
        }
      }
      // Dùng acceptedIds thay ids cho các bước tiếp theo
      ids = acceptedIds;

      // Khôi phục mapping cho các nhóm đã lưu từ trước
      for (const g of current) {
        if (g.zalo_group_id && g.zalo_group_id !== g.group_id) {
          sess.groupIdMap.set(g.zalo_group_id, g.group_id);
        }
      }

      // Xóa nhóm không còn được chọn (so sánh theo zalo_group_id)
      const idsSet = new Set(ids);
      for (const g of current) {
        const watchId = g.zalo_group_id || g.group_id;
        if (!idsSet.has(watchId) && !idsSet.has(g.group_id)) {
          await dbm.removeAccountantGroup(userId, g.group_id);
        }
      }

      // Auto-import thành viên từ nhóm mới thêm — chỉ khi chưa có dữ liệu
      for (const zaloGId of newZaloIds) {
        const canonicalId = sess.groupIdMap.get(zaloGId) || zaloGId;
        const cnt = await dbm.countMembers(canonicalId);
        if (cnt === 0) importGroupMembers(sess, zaloGId, canonicalId).catch(() => {});
      }
    }
  } catch (e) {
    console.error(`[${userId}] setWatchedGroups:`, e?.message || e);
  }

  sess.selected = new Set(ids);
  sess.onEvent(userId, { type: "groups", groups: sess.groups, selected: [...sess.selected] });
}

export async function takeTrip(userId, { groupId, msgId, ownerId, text, trip }) {
  const sess = sessions.get(userId); if (!sess) return;
  // lưu cuốc đã nhận vào DB (status pending)
  const savedId = await dbm.saveTrip(userId, trip || { groupId, group: sess.groupNameById.get(groupId), sender: "", text, price: null }, "pending");
  try {
    await sleep(rand(OK_MIN, OK_MAX));
    const replyMsgId = trip?.replyMsgId || msgId; // sub-trip reply về tin gốc
    const rawMsg = sess.rawMsgById.get(replyMsgId) || sess.rawMsgById.get(msgId);
    const sent = await replyOk(sess.api, groupId, rawMsg, replyMsgId);
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

/** Full sync: thêm mới + cập nhật tên + XÓA người đã rời nhóm (dùng cho nút thủ công) */
async function fullSyncGroupMembers(sess, groupId) {
  let memberList = [];
  const info = await sess.api.getGroupInfo(groupId);
  memberList = extractMemberList(info, groupId);

  if (!memberList.length) {
    const tryMethods = ["getGroupMemberList", "fetchGroupMembers", "getGroupMembers"];
    for (const fn of tryMethods) {
      if (typeof sess.api[fn] !== "function") continue;
      try {
        const res = await sess.api[fn](groupId);
        memberList = Array.isArray(res) ? res : extractMemberList(res, groupId);
        if (memberList.length) break;
      } catch {}
    }
  }

  const gDbg = info?.gridInfoMap?.[groupId] || Object.values(info?.gridInfoMap || {})[0];
  console.log(`[fullSync] ${groupId}: ${memberList.length} thành viên (currentMems=${gDbg?.currentMems?.length ?? "n/a"} memberIds=${gDbg?.memberIds?.length ?? "n/a"} hasMore=${gDbg?.hasMoreMember ?? "n/a"})`);
  if (!memberList.length) throw new Error(`Nhóm ${groupId}: không lấy được danh sách thành viên từ Zalo`);

  const activeUids = [];
  let added = 0, i = 0;
  for (const m of memberList) {
    const uid = String(m?.uid || m?.userId || m?.id || "");
    if (!uid) continue;
    const existing = await dbm.getMemberByZaloUid(groupId, uid);
    if (!existing) added++;
    await dbm.upsertMember(groupId, uid, {
      display_name: m.dName || m.displayName || m.name || null,
      avatar: m.avt || m.avatar || m.avatarUrl || null,
    });
    activeUids.push(uid);
    if (++i % 10 === 0) await yieldLoop(); // nhường event loop mỗi 10 member
  }
  // Tự upsert chính mình — Zalo không echo tin nhắn của bot về chính nó
  if (sess.selfId && !activeUids.includes(String(sess.selfId))) {
    await dbm.upsertMember(groupId, String(sess.selfId), { display_name: sess.selfName || null });
    activeUids.push(String(sess.selfId));
    added++;
  }
  const removed = await dbm.deleteRemovedMembers(groupId, activeUids);
  return { added, removed, total: activeUids.length };
}

/** Đồng bộ thủ công toàn bộ thành viên cho tất cả nhóm của kế toán (thêm + xóa) */
export async function syncGroupMembers(userId) {
  const sess = sessions.get(userId);
  if (!sess) throw new Error("Chưa kết nối Zalo");
  const groups = await dbm.getAccountantGroups(userId);
  let totalAdded = 0, totalRemoved = 0, totalMembers = 0;
  for (const g of groups) {
    const r = await fullSyncGroupMembers(sess, g.group_id);
    totalAdded += r.added;
    totalRemoved += r.removed;
    totalMembers += r.total;
    await yieldLoop(); // nhường event loop giữa các nhóm
  }
  return { groups: groups.length, added: totalAdded, removed: totalRemoved, total: totalMembers };
}

/** Tìm tài khoản Zalo theo số điện thoại */
export async function lookupUserByPhone(userId, phone) {
  const sess = sessions.get(userId);
  if (!sess) throw new Error("Chưa kết nối Zalo");
  const result = await sess.api.findUser(phone);
  if (!result?.uid) throw new Error("Không tìm thấy tài khoản Zalo với số điện thoại này");
  return {
    uid: String(result.uid),
    display_name: result.display_name || result.zalo_name || null,
    avatar: result.avatar || null,
  };
}

/** Lấy tên + avatar cho các thành viên chưa có tên, dùng getGroupMembersInfo batch 50 UID/request */
export async function enrichGroupMemberNames(userId, groupId) {
  const sess = sessions.get(userId);
  if (!sess) throw new Error("Chưa kết nối Zalo");

  const allMembers = await dbm.listMembers(groupId);
  const unnamed = allMembers.filter(m => !m.display_name);
  if (!unnamed.length) return { enriched: 0, unchanged: allMembers.length - unnamed.length, total: allMembers.length };

  const BATCH = 50;
  const DELAY = 1500;
  let enriched = 0;

  for (let i = 0; i < unnamed.length; i += BATCH) {
    const batch = unnamed.slice(i, i + BATCH);
    const uids = batch.map(m => m.zalo_uid);
    try {
      const result = await sess.api.getGroupMembersInfo(uids);
      const profiles = result?.data?.profiles || result?.profiles || {};
      for (const uid of uids) {
        // Zalo trả key dạng "uid_0"
        const info = profiles[uid] || profiles[`${uid}_0`];
        if (!info) continue;
        const name = info.displayName || info.zaloName || null;
        const avatar = info.avatar || null;
        if (name || avatar) {
          await dbm.upsertMember(groupId, uid, { display_name: name, avatar });
          enriched++;
        }
      }
    } catch (e) {
      console.error(`[${userId}] enrichGroupMemberNames batch ${i}–${i + BATCH}:`, e?.message || e);
    }
    if (i + BATCH < unnamed.length) await sleep(DELAY);
  }

  console.log(`[${userId}] enrichGroupMemberNames ${groupId}: ${enriched}/${unnamed.length} đã lấy tên`);
  return { enriched, unchanged: allMembers.length - unnamed.length, total: allMembers.length };
}

export function stopSession(userId) {
  const sess = sessions.get(userId);
  if (!sess) return;
  clearInterval(sess.cookieSaveTimer);
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

// Periodic catchup mỗi 10 phút: bù tin nhắn bị bỏ sót khi WS drop âm thầm
// Chỉ chạy cho kế toán (họ mới cần barem tracking chính xác)
// Nếu session mới nhận tin < 5 phút → không cần catchup (WS vẫn sống)
const CATCHUP_INTERVAL = 10 * 60 * 1000;
const CATCHUP_SKIP_IF_RECENT = 5 * 60 * 1000;
setInterval(async () => {
  for (const [userId, sess] of sessions.entries()) {
    if (!sess.isAccountant) continue;
    const silent = Date.now() - sess.lastMsgAt;
    if (silent < CATCHUP_SKIP_IF_RECENT) continue; // WS vẫn đang nhận tin → bỏ qua
    try {
      const acctGroups = await dbm.getAccountantGroups(userId);
      for (const ag of acctGroups) {
        const zaloId = ag.zalo_group_id || ag.group_id;
        catchUpMissedMessages(sess, zaloId).catch(() => {});
        await sleep(600);
      }
    } catch (e) {
      console.warn(`[${userId}] periodic catchup:`, e?.message || e);
    }
    await sleep(3000); // stagger giữa các session
  }
}, CATCHUP_INTERVAL);
