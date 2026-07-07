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
    uidGlobalIdCache: new Map(), // zalo_uid → { globalId, phone } — tránh gọi getUserInfo lặp lại
    groupNameById: new Map(),
    claims: new Map(),          // `${groupId}:${ownerId}` -> {savedId, msgId, text}
    rawMsgById: new Map(),      // msgId -> object message gốc (để reply đúng tin)
    processedMsgIds: new Set(), // dedup catchup (không cần DB raw_messages)
    quoteChain: new Map(),      // msgId → parentMsgId (truy vết reply chain cho Section E)
    sentOks: new Map(),         // msgId cuốc -> {groupId, sent, savedId} (để thu hồi khi huỷ)
    tripMsgCache: new Map(),    // msgId → {type, price, senderId} — cuốc gần đây (barem tracking)
    claimCache: new Map(),      // claimMsgId → {tripPosterId, takerId, takerName, tripType, tripPrice}
    _importingInstances: new Set(), // guard tránh import cùng instance song song
    onEvent,
    lastMsgAt: Date.now(),      // timestamp tin nhắn cuối (để phát hiện session chết)
    isAccountant: false,        // set sau khi getUserPublic
    cookieSaveTimer: null,      // interval lưu cookies định kỳ
  };
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


// Lấy globalId + phone của 1 UID từ Zalo API, dùng cache để không gọi lặp lại
async function resolveGlobalId(sess, zaloUid) {
  if (!zaloUid || !sess.api) return {};
  const cached = sess.uidGlobalIdCache.get(zaloUid);
  if (cached) return cached;
  try {
    const resp = await sess.api.getUserInfo(zaloUid);
    const prof = resp?.changed_profiles?.[zaloUid]
      || Object.values(resp?.changed_profiles || {})[0];
    const result = {
      globalId: prof?.globalId || null,
      phone:    prof?.phoneNumber || null,
    };
    if (result.globalId) sess.uidGlobalIdCache.set(zaloUid, result);
    return result;
  } catch { return {}; }
}

// Batch-resolve globalId + phone cho nhiều UIDs, cập nhật cache, trả về Map uid→{globalId,phone}
async function batchResolveGlobalIds(sess, uids) {
  if (!uids?.length || !sess.api) return {};
  const result = {};
  const toFetch = uids.filter(u => u && !sess.uidGlobalIdCache.has(u));
  // Lấy từ cache trước
  for (const u of uids) {
    const c = sess.uidGlobalIdCache.get(u);
    if (c) result[u] = c;
  }
  if (!toFetch.length) return result;
  const BATCH = 50;
  for (let i = 0; i < toFetch.length; i += BATCH) {
    try {
      const batch = toFetch.slice(i, i + BATCH);
      const resp = await sess.api.getUserInfo(batch);
      for (const [uid, prof] of Object.entries(resp?.changed_profiles || {})) {
        if (prof?.globalId) {
          const entry = { globalId: prof.globalId, phone: prof.phoneNumber || null };
          result[uid] = entry;
          sess.uidGlobalIdCache.set(uid, entry);
        }
      }
    } catch (e) {
      console.warn(`[${sess.userId}] batchResolveGlobalIds batch ${i}: ${e?.message}`);
    }
    if (i + BATCH < toFetch.length) await new Promise(r => setTimeout(r, 200));
  }
  return result;
}

// Resolve về zalo_uid canonical trong DB (qua uid_cross_map nếu cần).
// Dùng trước mọi DB write liên quan đến UID để đảm bảo luôn dùng UID của account chính.
async function resolveCanonicalUid(groupId, uid) {
  if (!uid) return uid;
  const member = await dbm.getMemberByZaloUid(groupId, uid);
  return member?.zalo_uid || uid;
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
      if (sess.processedMsgIds.has(String(rawMsgId))) continue;
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
        const zaloId = ag.zalo_group_id || ag.group_id;
        // Lazy migration: old-format (group_id = zalo_group_id) → per-accountant instanceId
        if (ag.group_id === zaloId) {
          const newInstanceId = `${sess.userId}_${zaloId}`;
          await dbm.migrateGroupInstanceForAccountant(sess.userId, ag.group_id, newInstanceId, zaloId);
          ag.group_id = newInstanceId;
          ag.zalo_group_id = zaloId;
          console.log(`[${sess.userId}] loadGroups lazy migrate ${zaloId} → ${newInstanceId}`);
        }
        // Khôi phục mapping zalo_group_id → canonical group_id
        if (ag.zalo_group_id && ag.zalo_group_id !== ag.group_id) {
          sess.groupIdMap.set(ag.zalo_group_id, ag.group_id);
        }
        // Auto-import khi instance chưa có thành viên (sau migration hoặc import lần đầu)
        // Guard tránh chạy song song với setWatchedGroups
        const cnt = await dbm.countMembers(ag.group_id);
        if (cnt === 0 && !sess._importingInstances.has(ag.group_id)) {
          sess._importingInstances.add(ag.group_id);
          importGroupMembers(sess, zaloId, ag.group_id)
            .finally(() => sess._importingInstances.delete(ag.group_id))
            .catch(() => {});
        }
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
  "Ghép 3":          ["ghep_3", "ghep_2"],  // thử ghep_3 trước, fallback ghep_2
  "Không rõ":        ["ghep_1"],   // fallback barem: tính như ghép 1
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

  // Tìm rule khớp theo thứ tự ưu tiên của targetCodes (không theo thứ tự mảng barem)
  for (const code of targetCodes) {
    for (const rule of rules) {
      if ((rule.type || "").toLowerCase() !== code) continue;
      const pts = matchRule(rule);
      if (pts !== null) return pts;
    }
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
    // Cache quan hệ cha-con để Section E chain-walk truy ngược chuỗi reply
    // Lưu dưới CẢ 2 key (glob+cli) của bản thân, value = mảng [globId, cliId] của cha
    const _qraw = msg.data?.quote;
    if (_qraw) {
      // globalMsgId trong tin nhắn nhóm Zalo = threadId (ID nhóm), không phải ID tin nhắn duy nhất
      const _pg = _qraw.globalMsgId != null && String(_qraw.globalMsgId) !== groupId ? String(_qraw.globalMsgId) : null;
      const _pc = _qraw.cliMsgId   != null ? String(_qraw.cliMsgId)   : null;
      const _parents = [_pg, _pc].filter(Boolean);
      if (_parents.length) {
        const _og = msg.data?.msgId   != null ? String(msg.data.msgId)   : null;
        const _oc = msg.data?.cliMsgId != null ? String(msg.data.cliMsgId) : null;
        for (const k of [_og, _oc].filter(Boolean)) {
          sess.quoteChain.set(k, _parents);
          if (sess.quoteChain.size > 20000) sess.quoteChain.delete(sess.quoteChain.keys().next().value);
        }
      }
    }
    // Chain extension: nếu tin này reply vào tin đã có trong barem_msg_refs
    // VÀ người gửi là poster/taker của cuốc đó → thêm vào refs để Section E trace được
    // Người ngoài không liên quan đến cuốc xe → không track
    if (sess.isAccountant && _qraw) {
      const _pg2 = _qraw.globalMsgId != null && String(_qraw.globalMsgId) !== groupId ? String(_qraw.globalMsgId) : null;
      const _pc2 = _qraw.cliMsgId != null ? String(_qraw.cliMsgId) : null;
      Promise.resolve((async () => {
        let _tripRef = null;
        if (_pg2) _tripRef = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, _pg2));
        if (!_tripRef && _pc2) _tripRef = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, _pc2));
        if (!_tripRef) return;
        // Lấy poster/taker từ barem tx gốc (cả 2 loại: split row và pending combined row)
        const _txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, _tripRef));
        const _posterUid = _txs.find(t => t.type === 'barem' && t.to_member)?.to_member;
        const _takerUid  = _txs.find(t => t.type === 'barem' && t.from_member)?.from_member;
        if (!_posterUid && !_takerUid) return;
        // Cover multi-account: so sánh cả raw UID lẫn canonical
        const _senderC = await resolveCanonicalUid(dbGroupId, senderId);
        const _isParty = [senderId, _senderC].some(u => u && (u === _posterUid || u === _takerUid));
        if (!_isParty) return;
        const _og2 = msg.data?.msgId   != null ? String(msg.data.msgId)   : null;
        const _oc2 = msg.data?.cliMsgId != null ? String(msg.data.cliMsgId) : null;
        for (const _mid of [_og2, _oc2].filter(Boolean))
          Promise.resolve(dbm.addBaremMsgRef(dbGroupId, _mid, _tripRef)).catch(() => {});
      })()).catch(() => {});
    }
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

    // Dedup: đánh dấu đã xử lý (dùng cho catchup sau downtime thay vì raw_messages DB)
    const rawMsgId = String(msg.data?.msgId || msg.data?.cliMsgId || "");
    if (rawMsgId) {
      sess.processedMsgIds.add(rawMsgId);
      if (sess.processedMsgIds.size > 5000) sess.processedMsgIds.clear();
    }

    // Thu thập thành viên thụ động
    if (senderId && sess.isAccountant) {
      resolveGlobalId(sess, senderId).then(async ({ globalId, phone }) => {
        const name = senderName !== "Không rõ" ? senderName : null;
        await dbm.upsertMember(dbGroupId, senderId, {
          display_name: name,
          global_id: globalId || undefined,
          phone: phone || undefined,
        });
      }).catch(() => {});
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
          Promise.resolve((async () => {
            const senderMember = await dbm.getMemberByZaloUid(dbGroupId, senderId);
            const senderCanon = senderMember?.zalo_uid || senderId;
            const senderPts = Number(senderMember?.points ?? 0);
            const txId = await dbm.createPendingTransfer(dbGroupId, senderCanon, sr.toUid, sr.amount, text, msgId);
            if (senderPts >= sr.amount) {
              await dbm.approvePendingTransfer(txId);
              console.log(`[${sess.userId}] ✅ San auto-duyệt (đủ điểm ${senderPts}): ${senderCanon} → ${sr.toUid} ${sr.amount}đ`);
              return;
            }
            console.log(`[${sess.userId}] 📋 San pending (thiếu điểm ${senderPts}/${sr.amount}): ${senderCanon} → ${sr.toUid}`);
            sess.onEvent(sess.userId, {
              type: "pending_transfer", txId,
              groupId: dbGroupId, groupName,
              fromUid: senderCanon, fromName: senderName,
              toUid: sr.toUid, toName: sr.toName,
              points: sr.amount, rawText: text,
            });
          })()).catch(e => console.error(`[${sess.userId}] san điểm:`, e?.message || e));
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
            Promise.resolve((async () => {
              const senderMember = await dbm.getMemberByZaloUid(dbGroupId, senderId);
              const senderCanon = senderMember?.zalo_uid || senderId;
              const senderPts = Number(senderMember?.points ?? 0);
              const txId = await dbm.createPendingTransfer(dbGroupId, senderCanon, sr.toUid, sr.amount, text, msgId);
              if (senderPts >= sr.amount) {
                await dbm.approvePendingTransfer(txId);
                console.log(`[${sess.userId}] ✅ San (self) auto-duyệt (đủ điểm ${senderPts}): → ${sr.toUid} ${sr.amount}đ`);
                return;
              }
              console.log(`[${sess.userId}] 📋 San (self) pending (thiếu điểm ${senderPts}/${sr.amount})`);
              sess.onEvent(sess.userId, {
                type: "pending_transfer", txId,
                groupId: dbGroupId, groupName,
                fromUid: senderCanon, fromName: senderName,
                toUid: sr.toUid, toName: sr.toName || "",
                points: sr.amount, rawText: text,
              });
            })()).catch(e => console.error(`[${sess.userId}] san điểm (self):`, e?.message || e));
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
              const senderMember = await dbm.getMemberByZaloUid(dbGroupId, senderId);
              const senderCanon = senderMember?.zalo_uid || senderId;
              const senderPts = Number(senderMember?.points ?? 0);
              const txId = await dbm.createPendingTransfer(dbGroupId, senderCanon, sr.toUid, sr.amount, text, msgId);
              if (senderPts >= sr.amount) {
                await dbm.approvePendingTransfer(txId);
                console.log(`[${sess.userId}] ✅ KT san auto-duyệt (đủ điểm ${senderPts}): ${senderCanon} → ${sr.toUid} ${sr.amount}đ nhóm=${dbGroupId}`);
              } else {
                console.log(`[${sess.userId}] 📋 KT san pending (thiếu điểm ${senderPts}/${sr.amount}): ${senderCanon} → ${sr.toUid} nhóm=${dbGroupId}`);
                sess.onEvent(sess.userId, {
                  type: "pending_transfer", txId, groupId: dbGroupId, groupName,
                  fromUid: senderCanon, fromName: senderName,
                  toUid: sr.toUid, toName: sr.toName || "", points: sr.amount, rawText: text,
                });
              }
            }
            return;
          }

          // A.0a: Tất cả mentions đều là KT → tài xế trả/bán điểm cho KT
          const allToKT = mentions.every(mn => ktUids.has(String(mn.uid)));
          if (allToKT) {
            const amountRe = /(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|₫|d)(?!\w)/gi;
            let m; const amounts = [];
            while ((m = amountRe.exec(text)) !== null) {
              const val = parseFloat(m[1].replace(",", "."));
              if (val > 0 && val <= 20) amounts.push(val);
            }
            if (!amounts.length) return;
            const toM = mentions[0];
            const toMName = toM.display_name || toM.dName || "";
            if (toMName) Promise.resolve(dbm.upsertMember(dbGroupId, String(toM.uid), { display_name: toMName })).catch(() => {});
            const senderMember = await dbm.getMemberByZaloUid(dbGroupId, senderId);
            const senderCanon = senderMember?.zalo_uid || senderId;
            const senderPts = Number(senderMember?.points ?? 0);
            const txId = await dbm.createPendingTransfer(dbGroupId, senderCanon, String(toM.uid), amounts[0], text, msgId);
            if (senderPts >= amounts[0]) {
              await dbm.approvePendingTransfer(txId);
              console.log(`[${sess.userId}] ✅ Driver→KT san auto-duyệt (đủ điểm ${senderPts}): ${senderCanon} → ${toM.uid} ${amounts[0]}đ nhóm=${dbGroupId}`);
            } else {
              console.log(`[${sess.userId}] 📋 Driver→KT san pending (thiếu điểm ${senderPts}/${amounts[0]}): ${senderCanon} → ${toM.uid} nhóm=${dbGroupId}`);
              sess.onEvent(sess.userId, {
                type: "pending_transfer", txId, groupId: dbGroupId, groupName,
                fromUid: senderCanon, fromName: senderName,
                toUid: String(toM.uid), toName: toM.display_name || toM.dName || "",
                points: amounts[0], rawText: text,
              });
            }
            return;
          }

          // A.1: Người khác tag KT + người nhận (ktUid khác sess.selfId)
          if (!ktUid || ktUid === String(sess.selfId)) return;
          if (mentions.length >= 2) {
            const sanResults = detectSanDiem(text, mentions, ktUid);
            for (const sr of sanResults) {
              if (!sr.toUid) continue;
              if (sr.toName) Promise.resolve(dbm.upsertMember(dbGroupId, sr.toUid, { display_name: sr.toName })).catch(() => {});
              const senderMember = await dbm.getMemberByZaloUid(dbGroupId, senderId);
              const senderCanon = senderMember?.zalo_uid || senderId;
              const senderPts = Number(senderMember?.points ?? 0);
              const txId = await dbm.createPendingTransfer(dbGroupId, senderCanon, sr.toUid, sr.amount, text, msgId);
              if (senderPts >= sr.amount) {
                await dbm.approvePendingTransfer(txId);
                console.log(`[${sess.userId}] ✅ San auto-duyệt (đủ điểm ${senderPts}): ${senderCanon} → ${sr.toUid} ${sr.amount}đ nhóm=${dbGroupId}`);
              } else {
                console.log(`[${sess.userId}] 📋 San pending (thiếu điểm ${senderPts}/${sr.amount}): ${senderCanon} → ${sr.toUid} nhóm=${dbGroupId}`);
                sess.onEvent(sess.userId, {
                  type: "pending_transfer", txId, groupId: dbGroupId, groupName,
                  fromUid: senderCanon, fromName: senderName,
                  toUid: sr.toUid, toName: sr.toName || "", points: sr.amount, rawText: text,
                });
              }
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
      if (qd && (isClaimMessage(text) || isConfirmMessage(text))) {
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CLAIM] from=${senderId} quote=`, JSON.stringify(qd)?.slice(0, 300));
        const quoteOwnerId = String(qd.ownerId || "");
        // TQuote không có msgId — chỉ có cliMsgId (number) và globalMsgId (number)
        const qCliId = qd.cliMsgId != null ? String(qd.cliMsgId) : "";
        // globalMsgId trong tin nhóm Zalo = threadId (ID nhóm), lọc ra để tránh nhầm với ID tin nhắn
        const qGlobId = qd.globalMsgId != null && String(qd.globalMsgId) !== groupId ? String(qd.globalMsgId) : "";
        let cachedTrip = sess.tripMsgCache.get(qCliId) || (qGlobId ? sess.tripMsgCache.get(qGlobId) : null);
        // Fallback DB nếu cache bị evict (cuốc đăng sáng, "Ok" chiều)
        if (!cachedTrip) {
          cachedTrip = (qCliId ? await dbm.getTripLog(dbGroupId, qCliId) : null)
                    || (qGlobId ? await dbm.getTripLog(dbGroupId, qGlobId) : null);
          if (cachedTrip) console.log(`[${sess.userId}] 📂 (C) tripLog từ DB: ${qCliId || qGlobId}`);
        }
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
            tripFree: !!cachedTrip.free,
            allTrips: cachedTrip.allTrips || null,
            tripMsgId: qCliId || qGlobId || null,
          };
          sess.claimCache.set(msgId, claimData);
          if (msg.data.cliMsgId) sess.claimCache.set(String(msg.data.cliMsgId), claimData);
          cacheRawMsg(sess, msgId, msg);
          while (sess.claimCache.size > 100)
            sess.claimCache.delete(sess.claimCache.keys().next().value);
          // Lưu DB để dùng khi cache bị evict (B Ok sáng, poster xác nhận chiều)
          Promise.resolve(dbm.saveClaimLog(dbGroupId, msgId, msg.data.cliMsgId ? String(msg.data.cliMsgId) : null, claimData)).catch(() => {});
        }
      }
    }

    // (D) Kế toán: chủ cuốc xác nhận "ok ib" cho người nhận → áp dụng barem
    if (sess.isAccountant && senderId !== String(sess.selfId) && isConfirmMessage(text)) {
      const qd = msg.data?.quote;
      if (qd) {
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CONFIRM] from=${senderId} quote=`, JSON.stringify(qd)?.slice(0, 300));
        const qCliId2  = qd.cliMsgId != null ? String(qd.cliMsgId) : "";
        // globalMsgId trong tin nhóm Zalo = threadId (ID nhóm), lọc ra để tránh nhầm với ID tin nhắn
        const qGlobId2 = qd.globalMsgId != null && String(qd.globalMsgId) !== groupId ? String(qd.globalMsgId) : "";
        let cachedClaim = sess.claimCache.get(qCliId2) || (qGlobId2 ? sess.claimCache.get(qGlobId2) : null);
        // Fallback DB nếu cache bị evict
        if (!cachedClaim) {
          cachedClaim = (qCliId2 ? await dbm.getClaimLog(dbGroupId, qCliId2) : null)
                     || (qGlobId2 ? await dbm.getClaimLog(dbGroupId, qGlobId2) : null);
          if (cachedClaim) console.log(`[${sess.userId}] 📂 (D) claimLog từ DB: ${qCliId2 || qGlobId2}`);
        }
        if (process.env.DEBUG_BAREM) console.log(`[BAREM_CONFIRM] cliMsgId=${qCliId2} globalMsgId=${qGlobId2} claimFound=${!!cachedClaim} posterMatch=${cachedClaim?.tripPosterId === senderId}`);
        if (cachedClaim && senderId === cachedClaim.tripPosterId) {
          sess.claimCache.delete(qCliId2);
          if (qGlobId2) sess.claimCache.delete(qGlobId2);
          // Xóa claim khỏi DB (đã consume)
          Promise.resolve(dbm.deleteClaimLog(dbGroupId, qCliId2 || qGlobId2)).catch(() => {});
          cacheRawMsg(sess, msgId, msg);
          // Capture cliMsgId của confirm message (để barem_msg_refs cover cả 2 ID)
          const confirmCliMsgId = msg.data?.cliMsgId ? String(msg.data.cliMsgId) : "";
          Promise.resolve((async () => {
            // Atomic claim: session đầu tiên ghi được vào barem_msg_refs thì được tính điểm.
            // Dùng confirmMsgId (không phải tripMsgId) để sau khi hủy vẫn confirm lại được.
            // Phòng 2 KT cùng nhận 1 tin ok-ib → cùng msgId → chỉ 1 session thắng.
            const txRef = msgId;
            if (txRef) {
              const claimed = await Promise.resolve(dbm.claimBaremScoring(dbGroupId, txRef));
              if (!claimed) {
                console.log(`[${sess.userId}] ⏭️  Barem skip dup: ${txRef}`);
                return;
              }
            }
            // "lịch free" / "lich free" = lịch trình rảnh, không phải cuốc miễn phí
            const confirmFree = /\b(?:fre+|frr|fii|fer)\b/i.test(text) && !/(?:lịch|lich)\s+(?:fre+|frr|fii|fer)/i.test(text);
            const rulesRow = await dbm.getRules(dbGroupId);
            const baremPts = calcBaremPoints(rulesRow, cachedClaim.tripType, cachedClaim.tripPrice);
            const confirmPts = parseBonus(text) || 0;
            let pts, ptsSrc;
            if (confirmPts > 0) {
              pts = confirmPts; ptsSrc = "(thỏa thuận trong tin xác nhận)";
            } else if (cachedClaim.tripFree || confirmFree) {
              pts = 0; ptsSrc = "(free)";
            } else if (cachedClaim.explicitPoints > 0) {
              pts = cachedClaim.explicitPoints;
              ptsSrc = cachedClaim.pointSource === "claim" ? "(thỏa thuận trong tin ok)" : "(explicit từ tin đăng)";
            } else {
              pts = baremPts;
              ptsSrc = `rules=${rulesRow ? "ok" : "null"}`;
            }
            console.log(`[${sess.userId}] 📊 Barem confirm: type=${cachedClaim.tripType} price=${cachedClaim.tripPrice}k pts=${pts} ${ptsSrc}`);
            const noRule = pts === 0 && !cachedClaim.tripFree && !confirmFree;
            if (noRule) {
              console.warn(`[${sess.userId}] ⚠️  Barem pts=0 — chưa có rule cho ${cachedClaim.tripType} ${cachedClaim.tripPrice}k → đưa về pending`);
            }
            const convo = JSON.stringify({
              tripTime: cachedClaim.tripTime, tripPoster: cachedClaim.tripPosterName, tripText: cachedClaim.tripText,
              claimMsgId: qCliId2 || qGlobId2 || null,
              claimTime: cachedClaim.claimTime, claimer: cachedClaim.takerName, claimText: cachedClaim.claimText,
              confirmMsgId: msgId,
              confirmTime: time, confirmPoster: senderName, confirmText: text,
              multiTrips: cachedClaim.allTrips || null,
            });
            // Resolve về canonical UID (account A) phòng trường hợp account B đang xử lý
            const posterCanon = await resolveCanonicalUid(dbGroupId, cachedClaim.tripPosterId);
            const takerCanon  = await resolveCanonicalUid(dbGroupId, cachedClaim.takerId);
            if (cachedClaim.allTrips || noRule) {
              await dbm.addBaremPending(dbGroupId, posterCanon, takerCanon, pts, msgId, convo);
              // Lưu mapping để Section E (cancel/adjust) tìm được pending tx qua quote chain
              for (const mid of [msgId, confirmCliMsgId, qCliId2, qGlobId2, cachedClaim.tripMsgId].filter(Boolean))
                Promise.resolve(dbm.addBaremMsgRef(dbGroupId, mid, msgId)).catch(e => console.warn(`[${sess.userId}] addBaremMsgRef(pending) err:`, e?.message || e));
              if (noRule) {
                console.log(`[${sess.userId}] ⏳ Barem pending (không có rule): ${cachedClaim.tripType} ${cachedClaim.tripPrice}k → 0đ chờ kế toán duyệt`);
              } else {
                console.log(`[${sess.userId}] ⏳ Barem pending [${cachedClaim.allTrips.length} cuốc]: ${pts}đ — chờ kế toán duyệt`);
              }
            } else {
              const reason = pts === 0 ? 'Lịch free' : (confirmPts > 0 ? `Chốt ${pts}đ (thỏa thuận)` : `Barem ${cachedClaim.tripType} ${cachedClaim.tripPrice}k`);
              const txMsgId = cachedClaim.tripMsgId || msgId;
              // Truyền explicit from/to_member để tránh bug -0 >= 0 === true trong JS
              // (khi pts=0, delta âm vẫn >= 0 nên DB lưu to_member thay vì from_member cho taker)
              await dbm.adjustPoints(dbGroupId, posterCanon, +pts, reason, 'barem', txMsgId, null, posterCanon, convo);
              await dbm.adjustPoints(dbGroupId, takerCanon,  -pts, reason, 'barem', txMsgId, takerCanon, null, convo);
              // Lưu mapping msg → trip_msg_id để Section E tìm được sau khi restart
              // confirmCliMsgId đảm bảo cover cả trường hợp msg.data.msgId ≠ msg.data.cliMsgId
              for (const mid of [msgId, confirmCliMsgId, qCliId2, qGlobId2, cachedClaim.tripMsgId].filter(Boolean))
                Promise.resolve(dbm.addBaremMsgRef(dbGroupId, mid, txMsgId)).catch(e => console.warn(`[${sess.userId}] addBaremMsgRef err:`, e?.message || e));
              console.log(`[${sess.userId}] ✅ Barem auto: ${pts}đ | ${ptsSrc}`);
            }
          })()).catch(e => console.error(`[${sess.userId} ] barem apply:`, e?.message || e));
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
      let ktMentioned = mentions.some(m => String(m.uid) === String(sess.selfId));
      // Cũng nhận lệnh khi nhóm tag KT người thật (ktUid) thay vì tag bot
      if (!ktMentioned && mentions.length > 0) {
        const _ktUidE = await dbm.getGroupKtUid(dbGroupId);
        if (_ktUidE) ktMentioned = mentions.some(m => String(m.uid) === String(_ktUidE));
      }
      // Log khi có quote nhưng không kích hoạt được (luôn hiện, không cần DEBUG_BAREM)
      if (qd && !ktMentioned) console.log(`[BAREM_E] ⚠️ quote có nhưng ktMentioned=false | mentions=${JSON.stringify(mentions.map(m=>m.uid))} selfId=${sess.selfId} group=${dbGroupId}`);
      if (process.env.DEBUG_BAREM) console.log(`[BAREM_E] hasQuote=${!!qd} ktMentioned=${ktMentioned} mentions=${JSON.stringify(mentions.map(m=>m.uid))} selfId=${sess.selfId}`);
      // Tin không có quote → không thuộc cuốc nào, bỏ qua
      if (qd && ktMentioned) {
        const parsedBonus = parseBonus(text);
        const action = detectBaremAction(text) || (parsedBonus > 0 ? { type: 'adjust', points: parsedBonus } : null);
        if (!action) console.log(`[BAREM_E] ⚠️ ktMentioned=true nhưng không detect action | text="${text.slice(0,80)}"`);
        if (action) {
          // globalMsgId trong tin nhóm Zalo = threadId (ID nhóm), lọc ra để tránh nhầm với ID tin nhắn
          const qGlobId = qd.globalMsgId != null && String(qd.globalMsgId) !== groupId ? String(qd.globalMsgId) : "";
          const qCliId  = qd.cliMsgId   != null ? String(qd.cliMsgId)   : "";
          Promise.resolve((async () => {
            let txs = [];
            let foundTier = 0;
            // Tầng 1: quoted msg chính là trip_msg_id gốc
            if (qGlobId) txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, qGlobId));
            if (!txs.length && qCliId) txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, qCliId));
            if (txs.length) foundTier = 1;
            // Tầng 2: tìm qua confirmMsgId/claimMsgId trong raw_text JSON (ok ib message)
            if (!txs.length) {
              for (const mid of [qGlobId, qCliId].filter(Boolean)) {
                if (txs.length) break;
                txs = await Promise.resolve(dbm.getTransactionsByConfirmMsgId(dbGroupId, mid));
              }
              if (txs.length) foundTier = 2;
            } 
            // Tầng 3: tra bảng barem_msg_refs — bất kỳ tin nào đã được E xử lý đều là entry point
            if (!txs.length) {
              for (const mid of [qGlobId, qCliId].filter(Boolean)) {
                if (txs.length) break;
                try {
                  const refId = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, mid));
                  if (refId) txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, refId));
                } catch {}
              }
              if (txs.length) foundTier = 3;
            }
            // Tầng 3.5: quoteChain walk-up — leo ngược chuỗi reply tối đa 4 bước
            if (!txs.length) {
              const _visited = new Set([qGlobId, qCliId].filter(Boolean));
              let _toCheck = [..._visited];
              for (let _d = 0; _d < 4 && !txs.length && _toCheck.length; _d++) {
                const _next = [];
                for (const _mid of _toCheck) {
                  const _parents = sess.quoteChain.get(_mid);
                  if (!_parents) continue;
                  for (const _p of _parents) {
                    if (!_p || _visited.has(_p)) continue;
                    _visited.add(_p);
                    _next.push(_p);
                    try {
                      const _refId = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, _p));
                      if (_refId) { txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, _refId)); if (txs.length) break; }
                    } catch {}
                  }
                  if (txs.length) break;
                }
                _toCheck = _next;
              }
              if (txs.length) foundTier = "3.5";
            }
            // Tầng 4: fallback theo UID người gửi — lấy barem gần nhất trong 48h
            // Thử cả raw senderId lẫn canonical (phòng trường hợp tx được lưu bằng canonical)
            if (!txs.length) {
              try {
                const senderCanon = await resolveCanonicalUid(dbGroupId, senderId);
                for (const uid of [...new Set([senderId, senderCanon])]) {
                  const latestRef = await Promise.resolve(dbm.getLatestBaremTripMsgId(dbGroupId, uid));
                  if (latestRef) {
                    txs = await Promise.resolve(dbm.getTransactionsByTripMsgId(dbGroupId, latestRef));
                    if (txs.length) break;
                  }
                }
              } catch {}
              if (txs.length) foundTier = 4;
            }
            if (!txs.length) {
              console.warn(`[${sess.userId}] (E) barem ${action.type}: không tìm thấy tx | quoted glob=${qGlobId} cli=${qCliId} | sender=${senderId} | group=${dbGroupId}`);
              return;
            }
            console.log(`[${sess.userId}] (E) barem ${action.type}: found ${txs.length} tx via tier${foundTier} | glob=${qGlobId} cli=${qCliId}`);
            // Dedup: nếu 2 KT cùng tag → chỉ 1 session được xử lý tin này
            // addBaremMsgRef dùng ON CONFLICT DO NOTHING — session nào insert trước thắng
            const _foundTripMsgId = txs.find(t => t.type === 'barem')?.trip_msg_id;
            const _dedupKey = `E:${msgId}`;
            const _alreadyDone = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, _dedupKey));
            if (_alreadyDone) {
              console.log(`[${sess.userId}] ⏭️ (E) skip dup: ${msgId}`);
              return;
            }
            if (_foundTripMsgId) {
              // Ghi dedup key + entry points cho chain tiếp theo
              for (const mid of [_dedupKey, msgId, qGlobId, qCliId].filter(Boolean))
                Promise.resolve(dbm.addBaremMsgRef(dbGroupId, mid, _foundTripMsgId)).catch(e => console.warn(`[${sess.userId}] addBaremMsgRef(E) err:`, e?.message || e));
            }
            // Xác định poster/taker từ barem tx GỐC (type='barem') — luôn đúng bất kể
            // hướng của các barem_adjust (diff âm làm from_member/to_member đổi chiều).
            // adjustPoints tạo 2 row riêng (to_member-only và from_member-only).
            // addBaremPending tạo 1 row kết hợp (cả hai field đều có) — cần xử lý riêng.
            const baremPosterTx = txs.find(t => t.type === 'barem' && t.to_member && !t.from_member);
            const baremTakerTx  = txs.find(t => t.type === 'barem' && t.from_member && !t.to_member);
            const baremPendingTx = txs.find(t => t.type === 'barem' && t.from_member && t.to_member);
            if ((!baremPosterTx || !baremTakerTx) && !baremPendingTx) {
              console.warn(`[${sess.userId}] (E) barem ${action.type}: không tìm thấy barem gốc trong ${txs.length} tx`);
              return;
            }
            const posterUid     = baremPosterTx?.to_member   ?? baremPendingTx.to_member;
            const takerUid      = baremTakerTx?.from_member  ?? baremPendingTx.from_member;
            const origTripMsgId = (baremPosterTx ?? baremPendingTx).trip_msg_id;

            // currentPts = tổng CÓ DẤU của tất cả txs đối với poster
            // (to_member=poster → +points; from_member=poster → -points)
            const currentPts = txs.reduce((s, t) => {
              if (t.to_member === posterUid) return s + Number(t.points);
              if (t.from_member === posterUid) return s - Number(t.points);
              return s;
            }, 0);

            // Giữ nội dung convo gốc + thêm tin hành động
            let baseConvo = null;
            try { baseConvo = baremPosterTx.raw_text ? JSON.parse(baremPosterTx.raw_text) : null; } catch {}

            // Lịch sử điều chỉnh — đọc từ barem tx (source of truth).
            // KHÔNG đọc từ adj txs vì cancel/free sẽ làm mất dữ liệu gốc nếu overwrite chúng.
            const adjustHistory = baseConvo?.adjustHistory || [];

            if (action.type === 'cancel') {
              const reversalConvo = JSON.stringify({
                ...(baseConvo || {}),
                ...(adjustHistory.length ? { adjustHistory } : {}),
                cancelTime: time, canceller: senderName, cancelText: text,
              });
              // Chỉ update raw_text của barem txs; adj txs chỉ zero points (giữ raw_text gốc)
              for (const tx of txs) {
                const upd = { points: 0, reason: 'Hủy lịch' };
                if (tx.type === 'barem') upd.raw_text = reversalConvo;
                await dbm.updateTransaction(tx.id, upd);
              }
              console.log(`[${sess.userId}] ❌ Barem cancel: set 0đ (${txs.length} tx) currentWas=${currentPts}đ | poster=${posterUid} taker=${takerUid}`);
            } else if (action.type === 'free') {
              const freeConvo = JSON.stringify({
                ...(baseConvo || {}),
                ...(adjustHistory.length ? { adjustHistory } : {}),
                freeTime: time, freePoster: senderName, freeText: text,
              });
              // Chỉ update raw_text của barem txs; adj txs chỉ zero points
              for (const tx of txs) {
                const upd = { points: 0, reason: 'Lịch free' };
                if (tx.type === 'barem') upd.raw_text = freeConvo;
                await dbm.updateTransaction(tx.id, upd);
              }
              console.log(`[${sess.userId}] 🆓 Barem free: set 0đ (${txs.length} tx) | poster=${posterUid} taker=${takerUid}`);
            } else if (action.type === 'adjust') {
              const diff = action.points - currentPts;
              if (diff === 0) return;
              const reason = `Thỏa thuận: ${currentPts}đ → ${action.points}đ`;
              // Hấp thụ cancel/free trước đó vào adjustHistory (khi điều chỉnh lại sau hủy/free)
              const prevEvents = [];
              if (baseConvo?.cancelText) prevEvents.push({ cancelTime: baseConvo.cancelTime, canceller: baseConvo.canceller, cancelText: baseConvo.cancelText });
              else if (baseConvo?.freeText) prevEvents.push({ cancelTime: baseConvo.freeTime, canceller: baseConvo.freePoster, cancelText: `[Free] ${baseConvo.freeText}` });
              const newEntry = { cancelTime: time, canceller: senderName, cancelText: text, adjFrom: currentPts, adjTo: action.points };
              const newAdjHistory = [...adjustHistory, ...prevEvents, newEntry];
              // Xóa cancelText/freeText cũ khỏi base (đã hấp thụ vào adjustHistory)
              const { cancelText: _ct, cancelTime: _cT, canceller: _c, freeText: _ft, freeTime: _fT, freePoster: _fp, adjustHistory: _ah, ...cleanBase } = baseConvo || {};
              const adjConvo = JSON.stringify({ ...cleanBase, adjustHistory: newAdjHistory });
              // Update barem txs để duy trì running adjustHistory
              for (const tx of txs) {
                if (tx.type === 'barem') await dbm.updateTransaction(tx.id, { raw_text: adjConvo });
              }
              // Tạo adj txs với full snapshot (context đầy đủ cho ConvoThread)
              const posterC = await resolveCanonicalUid(dbGroupId, posterUid);
              const takerC  = await resolveCanonicalUid(dbGroupId, takerUid);
              await dbm.adjustPoints(dbGroupId, posterC,  diff, reason, 'barem_adjust', origTripMsgId, null, null, adjConvo);
              await dbm.adjustPoints(dbGroupId, takerC,  -diff, reason, 'barem_adjust', origTripMsgId, null, null, adjConvo);
              console.log(`[${sess.userId}] 📝 Barem adjust: ${currentPts}→${action.points}đ diff=${diff} | poster=${posterUid} taker=${takerUid}`);
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
        const pricedTrips = trips.filter(t => t.price);
        if (pricedTrips.length > 0) {
          const primary = pricedTrips[0];
          const tripData = {
            type: primary.type, price: primary.price,
            senderId: primary.senderId, senderName, text, time,
            explicitPoints: primary.explicitPoints || 0,
            free: !!primary.free,
            // Tin nhiều cuốc: lưu toàn bộ để kế toán xem và điều chỉnh
            allTrips: pricedTrips.length > 1
              ? pricedTrips.map(t => ({ type: t.type, price: t.price, explicitPoints: t.explicitPoints || 0 }))
              : null,
          };
          sess.tripMsgCache.set(msgId, tripData);
          if (msg.data.cliMsgId) sess.tripMsgCache.set(String(msg.data.cliMsgId), tripData);
          while (sess.tripMsgCache.size > 100)
            sess.tripMsgCache.delete(sess.tripMsgCache.keys().next().value);
          // Lưu DB để dùng khi cache bị evict (cuốc đăng sáng, xác nhận chiều)
          Promise.resolve(dbm.saveTripLog(dbGroupId, msgId, msg.data.cliMsgId ? String(msg.data.cliMsgId) : null, tripData)).catch(() => {});
        }
      }
      for (let i = 0; i < trips.length; i++) {
        const subMsgId = trips.length === 1 ? msgId : `${msgId}_${i}`;
        const tripOut = { ...trips[i], msgId: subMsgId };
        if (trips.length > 1) {
          tripOut.replyMsgId = msgId;
          sess.rawMsgById.set(subMsgId, msg);
        }
        sess.onEvent(sess.userId, { type: "trip", trip: tripOut });
      }
    }
  } catch (e) {
    console.error(`[${sess.userId}] onMessage:`, e?.message || e);
  }
}

// Lưu rawMsg vào cache (giới hạn 200 tin)
function cacheRawMsg(sess, msgId, msg) {
  sess.rawMsgById.set(msgId, msg);
  if (sess.rawMsgById.size > 200) {
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
  for (let i = 0; i < trips.length; i++) {
    const subMsgId = trips.length === 1 ? base.msgId : `${base.msgId}_${i}`;
    const tripOut = { ...trips[i], msgId: subMsgId, isVoice: true };
    if (trips.length > 1) {
      tripOut.replyMsgId = base.msgId;
      sess.rawMsgById.set(subMsgId, rawMsg);
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
  // "lịch hủy" / "hủy lịch" / "lich huy" / "huy lich" / "hủy" đứng một mình
  if (/lich\s*hu[y]?|hu[y]?\s*lich|\bhuy\b/.test(t)) return { type: 'cancel' };
  // "lịch free" / standalone "free/freee/fre/fer" — báo lịch miễn phí sau khi đã chốt
  if (/lich\s*(?:fre+e*|frr|fii|fer|fee)|\b(?:fre+e*|frr|fii|fer|fee)\b/.test(t)) return { type: 'free' };
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
  const amountRe = /(\d+(?:[.,]\d+)?)\s*(?:điểm|diem|đ|₫|d)(?!\w)/gi;
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

/**
 * Lấy toàn bộ thành viên nhóm với tên đầy đủ:
 *  1. getGroupInfo → UIDs (memberIds hoặc memVerList)
 *  2. getGroupMembersInfo batch 100 → displayName, avatar
 * Trả về [{id, displayName, zaloName, avatar}]
 */
async function fetchAllMemberProfiles(sess, groupId) {
  const info = await sess.api.getGroupInfo(groupId);
  const g = info?.gridInfoMap?.[groupId] || Object.values(info?.gridInfoMap || {})[0];
  if (!g) return [];

  // Lấy UIDs: ưu tiên memberIds, fallback memVerList ("uid_version")
  let uids = g.memberIds?.length
    ? g.memberIds.map(u => String(u))
    : (g.memVerList || []).map(s => s.split('_')[0]);

  console.log(`[fetchAllMemberProfiles] ${groupId}: ${uids.length} uid (totalMember=${g.totalMember})`);
  if (!uids.length) return [];

  const profiles = {};
  const BATCH = 100;
  for (let i = 0; i < uids.length; i += BATCH) {
    const batch = uids.slice(i, i + BATCH);
    try {
      const r = await sess.api.getGroupMembersInfo(batch);
      const profs = r?.profiles || r?.data?.profiles || {};
      Object.assign(profiles, profs);
    } catch (e) {
      console.warn(`[fetchAllMemberProfiles] batch ${i}: ${e?.message}`);
    }
    if (i + BATCH < uids.length) await new Promise(r => setTimeout(r, 300)); // tránh rate-limit
  }

  // Trả về array chuẩn hoá
  const result = uids.map(uid => {
    // Zalo trả key dạng "uid" hoặc "uid_0"
    const p = profiles[uid] || profiles[`${uid}_0`] || {};
    return {
      id: uid,
      displayName: p.displayName || p.zaloName || null,
      avatar: p.avatar || null,
      accountStatus: p.accountStatus,
    };
  });
  console.log(`[fetchAllMemberProfiles] ${groupId}: ${result.filter(m => m.displayName).length}/${result.length} có tên`);
  return result;
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
    // Dùng fetchAllMemberProfiles để lấy đầy đủ UID + tên
    const memberList = await fetchAllMemberProfiles(sess, zaloGroupId);
    console.log(`[${sess.userId}] importGroupMembers ${zaloGroupId}→${dbGroupId}: ${memberList.length} thành viên`);

    // Batch-resolve globalId + phone cho tất cả members
    const allUids = memberList.map(m => String(m?.id || "")).filter(Boolean);
    const globalIdMap = await batchResolveGlobalIds(sess, allUids);

    let count = 0;
    for (const m of memberList) {
      const uid = String(m?.id || "");
      if (!uid) continue;
      const { globalId, phone } = globalIdMap[uid] || {};
      await dbm.upsertMember(dbGroupId, uid, {
        display_name: m.displayName || null,
        avatar: m.avatar || null,
        global_id: globalId || undefined,
        phone: phone || undefined,
      });
      // Xóa thành viên tạm (~imp_*) cùng tên nếu vừa tìm được người thật
      if (m.displayName) await dbm.mergeTempMember(dbGroupId, m.displayName);
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
      const limit = u.group_limit || 3;
      if (ids.length > limit) ids = ids.slice(0, limit);

      // current: các nhóm đã được lưu trong DB cho kế toán này
      const current = await dbm.getAccountantGroups(userId);
      // Lazy migration + khôi phục groupIdMap
      for (const g of current) {
        const zaloId = g.zalo_group_id || g.group_id;
        // Old-format: group_id = zaloId → migrate sang per-accountant instanceId
        if (g.group_id === zaloId) {
          const newInstanceId = `${userId}_${zaloId}`;
          await dbm.migrateGroupInstanceForAccountant(userId, g.group_id, newInstanceId, zaloId);
          g.group_id = newInstanceId;
          g.zalo_group_id = zaloId;
          console.log(`[${userId}] setWatchedGroups lazy migrate ${zaloId} → ${newInstanceId}`);
        }
        sess.groupIdMap.set(zaloId, g.group_id);
      }

      const currentZaloSet = new Set(current.map(g => g.zalo_group_id || g.group_id));
      const newZaloIds = ids.filter(gId => !currentZaloSet.has(gId));

      // Đăng ký nhóm mới — mỗi kế toán có instanceId riêng: ${userId}_${zaloGroupId}
      for (const gId of newZaloIds) {
        const g = sess.groups.find(gr => gr.id === gId);
        const groupName = g?.name || gId;
        const instanceId = `${userId}_${gId}`;
        sess.groupIdMap.set(gId, instanceId);
        await dbm.addAccountantGroup(userId, instanceId, groupName, gId);
        // Import thành viên từ Zalo API (mỗi instance độc lập, không share)
        if (!sess._importingInstances.has(instanceId)) {
          sess._importingInstances.add(instanceId);
          importGroupMembers(sess, gId, instanceId)
            .finally(() => sess._importingInstances.delete(instanceId))
            .catch(e => console.warn(`[${userId}] importGroupMembers ${instanceId}:`, e?.message || e));
        }
      }

      // Xóa nhóm không còn được chọn
      const idsSet = new Set(ids);
      for (const g of current) {
        const zaloId = g.zalo_group_id || g.group_id;
        if (!idsSet.has(zaloId)) {
          await dbm.removeAccountantGroup(userId, g.group_id);
          sess.groupIdMap.delete(zaloId);
        }
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

/** Full sync thành viên — cập nhật tên/avatar, thêm mới, đánh dấu người rời nhóm */
async function fullSyncGroupMembers(sess, groupId, { zaloGroupId = null } = {}) {
  const apiGroupId = zaloGroupId || groupId;
  const memberList = await fetchAllMemberProfiles(sess, apiGroupId);

  console.log(`[fullSync] ${groupId}: ${memberList.length} thành viên`);
  if (!memberList.length) throw new Error(`Nhóm ${groupId}: không lấy được danh sách thành viên từ Zalo`);

  const allUids = memberList.map(m => String(m?.id || "")).filter(Boolean);
  const globalIdMap = await batchResolveGlobalIds(sess, allUids);

  const activeUids = [];
  let added = 0, i = 0;
  for (const m of memberList) {
    const uid = String(m?.id || "");
    if (!uid) continue;
    const { globalId, phone } = globalIdMap[uid] || {};
    await dbm.upsertMember(groupId, uid, {
      display_name: m.displayName || null,
      avatar: m.avatar || null,
      global_id: globalId || undefined,
      phone: phone || undefined,
    });
    activeUids.push(uid);
    if (++i % 10 === 0) await yieldLoop();
  }
  if (sess.selfId && !activeUids.includes(String(sess.selfId))) {
    await dbm.upsertMember(groupId, String(sess.selfId), { display_name: sess.selfName || null });
    activeUids.push(String(sess.selfId));
    added++;
  }
  const removed = await dbm.markRemovedMembers(groupId, activeUids);
  return { added, removed, total: activeUids.length };
}

/** Đồng bộ thủ công toàn bộ thành viên cho tất cả nhóm của kế toán (thêm + xóa) */
export async function syncGroupMembers(userId) {
  const sess = sessions.get(userId);
  if (!sess) throw new Error("Chưa kết nối Zalo");
  const groups = await dbm.getAccountantGroups(userId);
  let totalAdded = 0, totalRemoved = 0, totalMembers = 0;
  for (const g of groups) {
    const zaloId = g.zalo_group_id || g.group_id;
    const r = await fullSyncGroupMembers(sess, g.group_id, { zaloGroupId: zaloId });
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

// Startup: xóa log cũ hơn 24h (phòng service restart giữa ngày)
Promise.resolve(dbm.purgeBaremLogs()).catch(() => {});

// Mỗi ngày 23:59: reset toàn bộ barem log — cuốc hôm trước không áp barem ngày hôm sau
function scheduleNightlyBaremReset() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(23, 59, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    Promise.resolve(dbm.clearBaremLogs()).catch(e => console.warn('clearBaremLogs:', e?.message));
    scheduleNightlyBaremReset();
  }, next.getTime() - Date.now());
}
scheduleNightlyBaremReset();
