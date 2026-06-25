// ============================================================
// index.js — Server đa phiên cho Trợ Lý Tài Xế AI
//  - HTTP API: đăng ký, đăng nhập, admin, đổi MK, đăng nhập/đăng xuất Zalo (QR)
//  - WebSocket: mỗi client kèm token → cô lập theo user
//  - Mỗi user một phiên Zalo riêng (sessionManager)
//  - DB: SQLite (dev) hoặc PostgreSQL (production) qua dbLayer
// ============================================================
import express from "express";
import { WebSocketServer } from "ws";
import "dotenv/config";

import * as dbm from "./dbLayer.js";
import * as sm from "./sessionManager.js";
import { config } from "./config.js";

const PORT = Number(process.env.PORT || 8082);

await dbm.ensureSeed();
await dbm.purgeOld();
// load cài đặt từ DB vào bộ nhớ
config.voiceEnabled = (await dbm.getSetting("voice_enabled", "1")) === "1";
const _storedFptKey = await dbm.getSetting("fpt_stt_api_key", null);
if (_storedFptKey) config.fptSttApiKey = _storedFptKey;
setInterval(() => dbm.purgeOld().catch(()=>{}), 6 * 3600 * 1000);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// auth helpers (async vì DB có thể là PostgreSQL)
function tokenOf(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const userId = dbm.userIdFromToken(token);
  return userId ? { userId, token } : null;
}
async function requireAdmin(req, res) {
  const a = tokenOf(req);
  if (!a) { res.status(401).json({ error: "Chưa đăng nhập" }); return null; }
  const u = await dbm.getUserPublic(a.userId);
  if (u.role !== "admin") { res.status(403).json({ error: "Không có quyền" }); return null; }
  return a;
}

// ---------- Auth ----------
app.post("/api/login", async (req, res) => {
  try { res.json(await dbm.login(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/logout", (req, res) => {
  const a = tokenOf(req); if (a) dbm.logout(a.token);
  res.json({ ok: true });
});
app.get("/api/me", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json(await dbm.getUserPublic(a.userId));
});
app.post("/api/change-password", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  try { res.json(await dbm.changePassword(a.userId, req.body.oldPass, req.body.newPass)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- Admin ----------
app.get("/api/admin/users", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.listUsers()); });
app.post("/api/admin/approve", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.approveUser(req.body.id, req.body.plan, req.body.amount || 0)); });
app.post("/api/admin/renew", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.renewUser(req.body.id, req.body.amount || 0)); });
app.post("/api/admin/ban", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.toggleBan(req.body.id)); });
app.post("/api/admin/reset-password", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try { res.json(await dbm.resetPassword(req.body.id, req.body.newPass)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/admin/stats/revenue", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(await dbm.getRevenueStats(Number(req.query.from) || 0, Number(req.query.to) || Date.now()));
});
app.get("/api/admin/stats/users", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(await dbm.getUserStats(Number(req.query.from) || 0, Number(req.query.to) || Date.now(), req.query.status || "all"));
});
app.post("/api/admin/set-role", async (req, res) => {
  const a = await requireAdmin(req, res); if (!a) return;
  if (req.body.id === a.userId && req.body.role !== "admin")
    return res.status(400).json({ error: "Không thể tự gỡ quyền admin của chính mình" });
  try { res.json(await dbm.setRole(req.body.id, req.body.role, req.body.groupLimit)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/admin/session-health", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(sm.getSessionsHealth());
});
app.get("/api/admin/groups", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(await dbm.listAllGroups());
});
app.post("/api/admin/groups/merge", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const { sourceGroupId, targetGroupId } = req.body;
  if (!sourceGroupId || !targetGroupId) return res.status(400).json({ error: "Thiếu sourceGroupId hoặc targetGroupId" });
  try { res.json(await dbm.mergeGroups(sourceGroupId, targetGroupId)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/admin/groups/:id/reset", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try { res.json(await dbm.resetGroupData(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/admin/groups/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try { res.json(await dbm.deleteGroup(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/admin/users/:id", async (req, res) => {
  const a = await requireAdmin(req, res); if (!a) return;
  if (req.params.id === a.userId) return res.status(400).json({ error: "Không thể xóa chính mình" });
  try { res.json(await dbm.deleteUser(req.params.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/admin/settings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const key = config.fptSttApiKey || process.env.FPT_STT_API_KEY || "";
  res.json({
    voice_enabled: config.voiceEnabled,
    fpt_api_key_set: !!key,
    fpt_api_key_hint: key ? "****" + key.slice(-4) : null,
  });
});
app.post("/api/admin/settings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const { key, value } = req.body;
  if (key === "voice_enabled") {
    await dbm.setSetting("voice_enabled", value ? "1" : "0");
    config.voiceEnabled = !!value;
    return res.json({ ok: true, voice_enabled: !!value });
  }
  if (key === "fpt_stt_api_key") {
    const trimmed = String(value || "").trim();
    await dbm.setSetting("fpt_stt_api_key", trimmed);
    config.fptSttApiKey = trimmed || null;
    return res.json({ ok: true, fpt_api_key_set: !!trimmed, fpt_api_key_hint: trimmed ? "****" + trimmed.slice(-4) : null });
  }
  res.status(400).json({ error: "Key không hợp lệ" });
});

// ---------- Admin: quản lý kế toán ----------
app.get("/api/admin/accountant-groups/:userId", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(await dbm.getAccountantGroups(req.params.userId));
});
app.get("/api/admin/groups/:groupId/accountants", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  res.json(await dbm.getGroupAccountants(req.params.groupId));
});
app.post("/api/admin/accountant-groups", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  const { accountantId, groupId, groupName, action } = req.body;
  if (!accountantId || !groupId) return res.status(400).json({ error: "Thiếu accountantId hoặc groupId" });
  if (action === "remove") await dbm.removeAccountantGroup(accountantId, groupId);
  else await dbm.addAccountantGroup(accountantId, groupId, groupName || groupId, null);
  res.json({ ok: true });
});

// ---------- Kế toán ----------
async function requireAccountant(req, res) {
  const a = tokenOf(req);
  if (!a) { res.status(401).json({ error: "Chưa đăng nhập" }); return null; }
  const u = await dbm.getUserPublic(a.userId);
  if (u.role !== "accountant" && u.role !== "admin") { res.status(403).json({ error: "Không có quyền" }); return null; }
  return { ...a, role: u.role };
}
async function checkGroupAccess(req, res, groupId) {
  const a = await requireAccountant(req, res); if (!a) return null;
  if (a.role === "admin") return a;
  const groups = await dbm.getAccountantGroups(a.userId);
  if (!groups.some(g => g.group_id === groupId)) { res.status(403).json({ error: "Không có quyền trên nhóm này" }); return null; }
  return a;
}

app.get("/api/accountant/groups", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  if (a.role === "admin") return res.json([]);
  res.json(await dbm.getAccountantGroups(a.userId));
});

// Xác nhận nhóm (lock tạm thời tắt — chỉ lưu, không khoá)
app.post("/api/accountant/confirm-groups", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const groups = await dbm.getAccountantGroups(a.userId);
  if (groups.length === 0) return res.status(400).json({ error: "Chưa chọn nhóm nào" });
  // await dbm.lockAccountantGroups(a.userId); // tạm tắt lock
  res.json({ ok: true, locked: false });
});

// Nhóm Zalo live của kế toán (cần session đang chạy)
app.get("/api/accountant/zalo-groups", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const sess = sm.getSession(a.userId);
  if (!sess) return res.json({ connected: false, groups: [], selected: [] });
  res.json({ connected: true, groups: sess.groups, selected: [...sess.selected] });
});

// Thành viên
app.get("/api/accountant/members", async (req, res) => {
  const { groupId } = req.query;
  if (!groupId) return res.status(400).json({ error: "Thiếu groupId" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  res.json(await dbm.listMembers(groupId));
});
app.post("/api/accountant/members", async (req, res) => {
  const { groupId, zaloUid, phone, display_name } = req.body;
  if (!groupId || !zaloUid) return res.status(400).json({ error: "Thiếu groupId hoặc zaloUid" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  try { res.json({ id: await dbm.upsertMember(groupId, zaloUid, { phone, display_name }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch("/api/accountant/members/alias", async (req, res) => {
  const { groupId, zaloUid, alias } = req.body;
  if (!groupId || !zaloUid) return res.status(400).json({ error: "Thiếu groupId hoặc zaloUid" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  try { await dbm.setMemberAlias(groupId, zaloUid, alias || null); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Import thành viên từ Excel — bước 1: tra cứu Zalo & xem trước
app.post("/api/accountant/members/import-preview", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const { groupId, rows } = req.body;
  if (!groupId || !Array.isArray(rows)) return res.status(400).json({ error: "Thiếu groupId hoặc rows" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  const preview = [];
  for (let i = 0; i < rows.length; i++) {
    const { stt, ten, sdt } = rows[i];
    let phone = String(sdt || "").replace(/\D/g, "");
    if (phone.startsWith("84")) phone = "0" + phone.slice(2);
    if (phone.length >= 9) {
      try {
        const user = await sm.lookupUserByPhone(a.userId, phone);
        const existing = await dbm.getMemberByZaloUid(groupId, user.uid);
        preview.push({ stt, ten, sdt: phone, status: existing ? "found_exists" : "found_new", uid: user.uid, zalo_name: user.display_name });
      } catch {
        preview.push({ stt, ten, sdt: phone, status: "not_found", uid: null, zalo_name: null });
      }
      if (i < rows.length - 1) await new Promise(r => setTimeout(r, 200));
    } else {
      preview.push({ stt, ten, sdt: sdt || "", status: "no_phone", uid: null, zalo_name: null });
    }
  }
  res.json(preview);
});

// Import thành viên từ Excel — bước 2: xác nhận ghi vào DB
app.post("/api/accountant/members/import-confirm", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const { groupId, rows } = req.body;
  if (!groupId || !Array.isArray(rows)) return res.status(400).json({ error: "Thiếu groupId hoặc rows" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  const batchTs = Date.now();
  let added = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.status === "found_exists") continue;
    const uid = row.uid || `~imp_${batchTs}_${i}`;
    try {
      await dbm.upsertMember(groupId, uid, { phone: row.sdt || null, display_name: row.ten || null });
      added++;
    } catch {}
  }
  res.json({ ok: true, added });
});

// Giao dịch điểm
app.get("/api/accountant/transactions", async (req, res) => {
  const { groupId, zaloUid, limit } = req.query;
  if (!groupId) return res.status(400).json({ error: "Thiếu groupId" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  res.json(await dbm.listTransactions(groupId, { zaloUid: zaloUid || null, limit: Number(limit) || 100 }));
});
app.post("/api/accountant/adjust-points", async (req, res) => {
  const { groupId, zaloUid, delta, reason, displayName } = req.body;
  if (!groupId || !zaloUid || delta === undefined) return res.status(400).json({ error: "Thiếu groupId, zaloUid hoặc delta" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  try {
    if (displayName) await dbm.upsertMember(groupId, zaloUid, { display_name: displayName });
    const txId = await dbm.adjustPoints(groupId, zaloUid, Number(delta), reason || "Kế toán chỉnh tay");
    res.json({ ok: true, txId });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.patch("/api/accountant/transactions/:id", async (req, res) => {
  try {
    const a = await requireAccountant(req, res); if (!a) return;
    await dbm.updateTransaction(req.params.id, req.body);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete("/api/accountant/transactions/:id", async (req, res) => {
  try {
    const a = await requireAccountant(req, res); if (!a) return;
    await dbm.deleteTransaction(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Đồng bộ thành viên từ Zalo (kế toán bấm nút thủ công)
app.post("/api/accountant/sync-members", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  try {
    const stats = await sm.syncGroupMembers(a.userId);
    res.json({ ok: true, ...stats });
  } catch (e) { res.status(400).json({ error: e.message || String(e) }); }
});

app.get("/api/accountant/lookup-user", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: "Thiếu số điện thoại" });
  try {
    const user = await sm.lookupUserByPhone(a.userId, phone);
    res.json(user);
  } catch (e) { res.status(400).json({ error: e.message || String(e) }); }
});

app.patch("/api/accountant/groups/:groupId/public-visible", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  const { visible } = req.body;
  if (typeof visible !== "boolean") return res.status(400).json({ error: "visible phải là boolean" });
  try {
    await dbm.setGroupPublicVisible(a.userId, req.params.groupId, visible);
    res.json({ ok: true, visible });
  } catch (e) { res.status(400).json({ error: e.message || String(e) }); }
});

app.post("/api/accountant/groups/:groupId/enrich-members", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  if (!await checkGroupAccess(req, res, req.params.groupId)) return;
  try {
    const stats = await sm.enrichGroupMemberNames(a.userId, req.params.groupId);
    res.json({ ok: true, ...stats });
  } catch (e) { res.status(400).json({ error: e.message || String(e) }); }
});

// San điểm — giao dịch chờ duyệt
app.get("/api/accountant/pending-transfers", async (req, res) => {
  const { groupId } = req.query;
  if (!groupId) return res.status(400).json({ error: "Thiếu groupId" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  res.json(await dbm.listPendingTransfers(groupId));
});
app.post("/api/accountant/pending-transfers/:id/approve", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  try { await dbm.approvePendingTransfer(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/accountant/pending-transfers/:id/reject", async (req, res) => {
  const a = await requireAccountant(req, res); if (!a) return;
  try { await dbm.rejectPendingTransfer(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Raw messages — tra soát lịch sử tin nhắn
app.get("/api/accountant/raw-messages", async (req, res) => {
  const { groupId, date, search } = req.query;
  if (!groupId) return res.status(400).json({ error: "Thiếu groupId" });
  if (!await checkGroupAccess(req, res, groupId)) return;
  // date dạng YYYY-MM-DD → chuyển sang ms (timezone VN UTC+7)
  let dateFrom, dateTo;
  if (date) {
    const vnOffset = 7 * 60 * 60 * 1000;
    const base = new Date(date + "T00:00:00+07:00").getTime();
    dateFrom = base;
    dateTo   = base + 86400000 - 1;
  }
  try {
    const msgs = await dbm.listRawMessages(groupId, { dateFrom, dateTo, search: search || null });
    res.json(msgs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Barem
app.get("/api/accountant/rules/:groupId", async (req, res) => {
  if (!await checkGroupAccess(req, res, req.params.groupId)) return;
  res.json(await dbm.getRules(req.params.groupId) || { group_id: req.params.groupId, rules_json: '{"rules":[]}', raw_text: "" });
});
app.post("/api/accountant/rules/:groupId", async (req, res) => {
  if (!await checkGroupAccess(req, res, req.params.groupId)) return;
  try {
    const { rules_json, raw_text } = req.body;
    await dbm.saveRules(req.params.groupId, rules_json, raw_text || "");
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// KT Zalo UID của nhóm (cho auto san điểm)
app.get("/api/accountant/kt-uid/:groupId", async (req, res) => {
  if (!await checkGroupAccess(req, res, req.params.groupId)) return;
  res.json({ kt_uid: await dbm.getGroupKtUid(req.params.groupId) || "" });
});
app.post("/api/accountant/kt-uid/:groupId", async (req, res) => {
  if (!await checkGroupAccess(req, res, req.params.groupId)) return;
  try {
    await dbm.setGroupKtUid(req.params.groupId, req.body.kt_uid || "");
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---------- Đăng nhập Zalo (QR) ----------
const pendingQR = new Map();
app.post("/api/zalo/login-qr", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  const u = await dbm.getUserPublic(a.userId);
  // Accountant và admin không cần gói dịch vụ để dùng Zalo
  if (u.role !== "accountant" && u.role !== "admin" && u.status !== "active")
    return res.status(403).json({ error: "Tài khoản chưa được duyệt/đã hết hạn" });
  try {
    sm.loginQR(a.userId,
      (ev) => {
        // type=0 (QRCodeGenerated) có data.image; type=2 scanned; type=4 GotLoginInfo — bỏ qua type != 0
        if (ev?.type !== 0) return;
        const b64 = ev?.data?.image || null;
        if (b64) {
          pendingQR.set(a.userId, b64);
          pushToUser(a.userId, { type: "qr", image: b64 });
          console.log(`[QR] user=${a.userId} len=${String(b64).length}`);
        } else {
          console.warn(`[QR] type=0 nhưng không có data.image:`, JSON.stringify(ev)?.slice(0, 150));
        }
      },
      pushToUser
    ).then(() => {
      pendingQR.delete(a.userId); // xoá QR cũ sau khi login thành công
      pushToUser(a.userId, { type: "zalo_ready" });
    }).catch(e => pushToUser(a.userId, { type: "zalo_error", error: String(e?.message || e) }));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});
app.post("/api/zalo/logout", (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  pendingQR.delete(a.userId);
  sm.logoutZalo(a.userId);
  pushToUser(a.userId, { type: "zalo_logout" });
  res.json({ ok: true });
});
// Lấy QR đang chờ qua HTTP (fallback khi WS bị ngắt đúng lúc QR được push)
app.get("/api/zalo/pending-qr", (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json({ image: pendingQR.get(a.userId) || null });
});

app.get("/", (_req, res) => res.send("TLX worker đang chạy"));
app.get("/health", (_req, res) => res.json({ ok: true, sessions: sm.sessionCount?.() ?? 0 }));

const server = app.listen(PORT, () => console.log(`🌐 Server (HTTP+WS) cổng ${PORT}`));

// ====================== WebSocket ======================
const wss = new WebSocketServer({ server, path: "/ws" });
const clientsByUser = new Map();

function pushToUser(userId, obj) {
  const set = clientsByUser.get(userId);
  if (!set) return;
  const msg = JSON.stringify(obj);
  for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(msg);
}

wss.on("connection", async (ws, req) => {
  const url = new URL(req.url, "http://x");
  const token = url.searchParams.get("token");
  const userId = dbm.userIdFromToken(token);
  if (!userId) { ws.close(4001, "Unauthorized"); return; }

  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId).add(ws);

  ensureZaloSession(userId).catch(() => {});
  const sess = sm.getSession(userId);
  if (sess) ws.send(JSON.stringify({ type: "groups", groups: sess.groups, selected: [...sess.selected] }));

  // Push lại QR đang chờ nếu WS vừa reconnect mà QR chưa được quét
  const pendingQrImg = pendingQR.get(userId);
  if (pendingQrImg) ws.send(JSON.stringify({ type: "qr", image: pendingQrImg }));

  ws.on("close", () => clientsByUser.get(userId)?.delete(ws));
  ws.on("message", (buf) => handleWs(userId, buf.toString()));
});

async function ensureZaloSession(userId) {
  if (sm.hasSession(userId)) return;
  const u = await dbm.getUserPublic(userId).catch(() => null);
  if (!u || (u.role !== "accountant" && u.role !== "admin")) return; // khôi phục session cho kế toán và admin
  const stored = await dbm.getZaloSession(userId);
  if (stored?.cookie) {
    try { await sm.startSessionFromStored(userId, pushToUser); console.log(`♻️  Khôi phục phiên Zalo ${userId}`); }
    catch (e) {
      console.error(`Không khôi phục phiên ${userId}:`, e?.message || e);
      // Cookie hết hạn → báo frontend để hiện thông báo đăng nhập lại
      pushToUser(userId, { type: "zalo_session_expired" });
    }
  }
}

async function handleWs(userId, raw) {
  let cmd; try { cmd = JSON.parse(raw); } catch { return; }
  if (cmd.action === "setGroups") sm.setWatchedGroups(userId, cmd.groupIds || []);
  if (cmd.action === "startZalo") ensureZaloSession(userId);
}

console.log("✅ Sẵn sàng.");

// Auto-restore Zalo sessions của tất cả kế toán/admin khi service boot
// Giúp barem và san điểm tự động tính mà không cần mở web app
;(async () => {
  await new Promise(r => setTimeout(r, 2000)); // đợi DB init xong
  const userIds = await Promise.resolve(dbm.listUsersWithZalo()).catch(() => []);
  for (const userId of userIds) {
    if (sm.hasSession(userId)) continue;
    sm.startSessionFromStored(userId, pushToUser)
      .then(() => console.log(`♻️  [boot] Restore phiên Zalo: ${userId}`))
      .catch(e => console.warn(`⚠️  [boot] Không restore ${userId}:`, e?.message || e));
    await new Promise(r => setTimeout(r, 500)); // stagger để tránh rate-limit Zalo
  }
})();
