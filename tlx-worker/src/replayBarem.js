// ============================================================
// replayBarem.js — Đọc lại tin nhắn Zalo trong 1 khung giờ, mô phỏng lại
// luồng barem (đăng cuốc → "ok" → "ok ib") để tính điểm bù cho khoảng
// thời gian bot mất kết nối / không đọc được chat.
//
// KHÁC onMessage(): module này THUẦN TÍNH TOÁN — không ghi DB, không bắn
// event real-time. KT xem trước bảng kết quả rồi mới bấm duyệt ghi thật.
//
// Giới hạn Zalo API: getGroupChatHistory(groupId, count) chỉ lấy được
// "N tin gần nhất", KHÔNG có lọc theo ngày/phân trang → phải tăng dần count
// tới khi phủ được mốc bắt đầu. Nếu chạm trần API mà vẫn chưa phủ đủ thì
// báo rõ phần thiếu thay vì âm thầm tính sót.
// ============================================================
import { parseMultipleTrips, isConfirmMessage, isClaimMessage, parseBonus } from "./parser.js";

const FETCH_STEPS = [200, 500, 1000, 2000];

const tsOf = (m) => Number(m?.data?.ts || m?.data?.createTime || m?.data?.serverTime || 0);
const textOf = (m) => (typeof m?.data?.content === "string" ? m.data.content : (m?.data?.content?.title || ""));

// Lấy lịch sử nhóm đủ phủ tới mốc fromMs (tăng dần count).
export async function fetchHistoryCovering(sess, zaloGroupId, fromMs) {
  let best = { msgs: [], oldestMs: null, covered: false, fetched: 0 };
  for (const count of FETCH_STEPS) {
    let msgs = [];
    try {
      const r = await sess.api.getGroupChatHistory(zaloGroupId, count);
      msgs = r?.groupMsgs || [];
    } catch (e) {
      if (best.msgs.length) break;               // đã có data vòng trước → dùng tạm
      throw new Error("Không lấy được lịch sử Zalo: " + (e?.message || e));
    }
    msgs = msgs.slice().sort((a, b) => tsOf(a) - tsOf(b));
    const oldestMs = msgs.length ? tsOf(msgs[0]) : null;
    best = { msgs, oldestMs, covered: oldestMs != null && oldestMs <= fromMs, fetched: msgs.length };
    if (best.covered) break;
    if (msgs.length < count) break;              // API trả ít hơn yêu cầu → hết lịch sử hoặc chạm trần
  }
  return best;
}

// Chuyển dòng raw_messages (DB) → đúng shape tin nhắn Zalo mà simulateBarem() nhận.
// Nhờ vậy toàn bộ logic mô phỏng dùng lại nguyên vẹn, không cần sửa gì.
export function rowsToMessages(rows, zaloGroupId) {
  return rows.map((r) => {
    let mentions = null;
    if (r.mentions) { try { mentions = JSON.parse(r.mentions); } catch { mentions = null; } }
    const hasQuote = r.quote_cli_msg_id || r.quote_global_msg_id;
    return {
      threadId: String(zaloGroupId),
      type: 1,
      data: {
        msgId: r.msg_id,
        cliMsgId: r.cli_msg_id || undefined,
        ts: Number(r.created_at),
        uidFrom: r.sender_id,
        dName: r.sender_name || "Không rõ",
        content: r.text || "",
        msgType: r.msg_type || 0,
        ...(mentions ? { mentions } : {}),
        ...(hasQuote ? {
          quote: {
            cliMsgId: r.quote_cli_msg_id || undefined,
            globalMsgId: r.quote_global_msg_id || undefined,
            ownerId: r.quote_owner_id || undefined,
          },
        } : {}),
      },
    };
  });
}

// Mô phỏng luồng barem trên tập tin nhắn.
// Cache được dựng từ TOÀN BỘ tin lấy được (kể cả trước khung giờ) để bắt được
// cuốc đăng trước 14h nhưng chốt trong 14h-21h; nhưng chỉ XUẤT kết quả cho
// tin xác nhận nằm TRONG khung giờ.
export function simulateBarem({ msgs, fromMs, toMs, rulesRow, groupId, calcPoints }) {
  const tripCache = new Map();    // msgId|cliMsgId → trip data
  const claimCache = new Map();   // msgId|cliMsgId → claim data
  const results = [];
  let seq = 0;

  const setBoth = (map, msg, val) => {
    const a = msg.data?.msgId != null ? String(msg.data.msgId) : null;
    const b = msg.data?.cliMsgId != null ? String(msg.data.cliMsgId) : null;
    for (const k of [a, b].filter(Boolean)) map.set(k, val);
  };
  const quoteKeys = (q, gid) => {
    const c = q?.cliMsgId != null ? String(q.cliMsgId) : null;
    const g = q?.globalMsgId != null && String(q.globalMsgId) !== String(gid) ? String(q.globalMsgId) : null;
    return [c, g].filter(Boolean);
  };
  const lookup = (map, keys) => { for (const k of keys) { const v = map.get(k); if (v) return v; } return null; };

  for (const msg of msgs) {
    const text = textOf(msg);
    if (!text) continue;
    const ts = tsOf(msg);
    const senderId = String(msg.data?.uidFrom || msg.data?.senderId || "");
    const senderName = msg.data?.dName || "Không rõ";
    const msgId = String(msg.data?.msgId || msg.data?.cliMsgId || "");
    const cliMsgId = msg.data?.cliMsgId != null ? String(msg.data.cliMsgId) : null;
    const q = msg.data?.quote;
    const qKeys = q ? quoteKeys(q, msg.threadId) : [];
    const timeStr = new Date(ts).toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });

    // ── (D) Chủ cuốc xác nhận "ok ib" → phát sinh điểm ──────────────
    if (q && isConfirmMessage(text)) {
      const claim = lookup(claimCache, qKeys);
      if (claim && senderId === claim.tripPosterId) {
        // Chỉ xuất kết quả nếu tin xác nhận nằm trong khung giờ yêu cầu
        if (ts >= fromMs && ts <= toMs) {
          const confirmFree = /\b(?:fre+|frr+|fii+|fer+|fee+|fri+)\b/i.test(text)
            && !/(?:lịch|lich)\s+(?:fre+|frr+|fii+|fer+|fee+|fri+)/i.test(text);
          const confirmPts = parseBonus(text) || 0;
          const baremPts = calcPoints(rulesRow, claim.tripType, claim.tripPrice);
          let points, ptsSrc;
          if (confirmPts > 0)              { points = confirmPts;            ptsSrc = "Thỏa thuận trong tin xác nhận"; }
          else if (claim.tripFree || confirmFree) { points = 0;              ptsSrc = "Lịch free"; }
          else if (claim.explicitPoints > 0) { points = claim.explicitPoints; ptsSrc = claim.pointSource === "claim" ? "Thỏa thuận trong tin ok" : "Điểm ghi trong tin đăng"; }
          else                             { points = baremPts;              ptsSrc = "Barem"; }

          const needsRule = points === 0 && !claim.tripFree && !confirmFree;
          results.push({
            id: `r${seq++}`,
            confirmMsgId: msgId,
            confirmCliMsgId: cliMsgId,
            tripMsgId: claim.tripMsgId || msgId,
            claimMsgId: claim.claimMsgId || null,
            ts, timeStr,
            tripTime: claim.tripTime, tripText: claim.tripText,
            tripType: claim.tripType, tripPrice: claim.tripPrice,
            posterUid: claim.tripPosterId, posterName: claim.tripPosterName,
            takerUid: claim.takerId, takerName: claim.takerName,
            claimText: claim.claimText, claimTime: claim.claimTime,
            confirmText: text, confirmTime: timeStr, confirmName: senderName,
            points, ptsSrc, needsRule,
            multiTrips: claim.allTrips || null,
            alreadyExists: false,   // điền ở bước checkExisting
          });
        }
        claimCache.delete(qKeys[0]);
        continue;
      }
    }

    // ── (C) Người nhận reply "ok" vào tin cuốc → lưu claim ──────────
    if (q && (isClaimMessage(text) || isConfirmMessage(text))) {
      const trip = lookup(tripCache, qKeys);
      const quoteOwnerId = String(q.ownerId || "");
      if (trip && quoteOwnerId && quoteOwnerId !== senderId) {
        const negotiated = parseBonus(text) || 0;
        setBoth(claimCache, msg, {
          tripPosterId: trip.senderId, tripPosterName: trip.senderName,
          takerId: senderId, takerName: senderName,
          tripType: trip.type, tripPrice: trip.price,
          tripText: trip.text, tripTime: trip.time,
          claimText: text, claimTime: timeStr, claimMsgId: msgId,
          explicitPoints: negotiated || trip.explicitPoints || 0,
          pointSource: negotiated > 0 ? "claim" : (trip.explicitPoints > 0 ? "trip" : "barem"),
          tripFree: !!trip.free,
          allTrips: trip.allTrips || null,
          tripMsgId: qKeys[0] || null,
        });
        continue;
      }
    }

    // ── (B) Tin đăng cuốc mới → lưu vào tripCache ───────────────────
    const trips = parseMultipleTrips({
      groupId, groupName: "", senderId, senderName, msgId, text, time: timeStr,
    });
    if (trips.length > 0) {
      const main = trips.find(t => t.price) || trips[0];
      setBoth(tripCache, msg, {
        senderId, senderName,
        type: main.type, price: main.price,
        text, time: timeStr,
        explicitPoints: main.explicitPoints || 0,
        free: !!main.free,
        allTrips: trips.length > 1 ? trips : null,
      });
    }
  }

  return results;
}

// Đánh dấu những giao dịch đã tồn tại trong DB (tránh cộng điểm 2 lần).
// Dùng đúng khóa mà claimBaremScoring() ghi: "<confirmMsgId>__claim".
export async function markExisting(dbm, dbGroupId, items) {
  for (const it of items) {
    let exists = false;
    for (const mid of [it.confirmMsgId, it.confirmCliMsgId].filter(Boolean)) {
      const ref = await Promise.resolve(dbm.getBaremMsgRefTripMsgId(dbGroupId, mid + "__claim"));
      if (ref) { exists = true; break; }
    }
    it.alreadyExists = exists;
  }
  return items;
}

// Ghi thật vào DB — lặp lại đúng luồng Section D của sessionManager.
export async function applyItems(dbm, dbGroupId, items) {
  let created = 0, pending = 0, skipped = 0;
  const errors = [];
  for (const it of items) {
    try {
      const txRef = it.confirmMsgId;
      const claimed = await Promise.resolve(dbm.claimBaremScoring(dbGroupId, txRef));
      if (!claimed) { skipped++; continue; }   // đã tính điểm trước đó → bỏ qua

      const pts = Number(it.points) || 0;
      const convo = JSON.stringify({
        tripTime: it.tripTime, tripPoster: it.posterName, tripText: it.tripText,
        claimMsgId: it.claimMsgId, claimTime: it.claimTime, claimer: it.takerName, claimText: it.claimText,
        confirmMsgId: it.confirmMsgId, confirmTime: it.confirmTime, confirmPoster: it.confirmName,
        confirmText: it.confirmText, multiTrips: it.multiTrips, replay: true,
      });

      if (it.multiTrips || it.needsRule) {
        await dbm.addBaremPending(dbGroupId, it.posterUid, it.takerUid, pts, it.confirmMsgId, convo);
        pending++;
      } else {
        const reason = pts === 0 ? "Lịch free (đọc lại)" : `${it.ptsSrc} (đọc lại)`;
        const txMsgId = it.tripMsgId || it.confirmMsgId;
        await dbm.adjustPoints(dbGroupId, it.posterUid, +pts, reason, "barem", txMsgId, null, it.posterUid, convo);
        await dbm.adjustPoints(dbGroupId, it.takerUid,  -pts, reason, "barem", txMsgId, it.takerUid, null, convo);
        created++;
      }
      for (const mid of [it.confirmMsgId, it.confirmCliMsgId, it.claimMsgId, it.tripMsgId].filter(Boolean))
        await Promise.resolve(dbm.addBaremMsgRef(dbGroupId, mid, it.tripMsgId || it.confirmMsgId)).catch(() => {});
    } catch (e) {
      errors.push({ id: it.id, error: e?.message || String(e) });
    }
  }
  return { created, pending, skipped, errors };
}
