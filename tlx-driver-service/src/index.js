// ============================================================
// tlx-driver-service — Service riêng cho tài xế (port 8080)
//  Tách biệt khỏi admin/kế toán để update độc lập, không ảnh hưởng nhau.
//  Dùng chung DB (SQLite/PG) với tlx-worker qua DATA_DIR.
//  Import shared modules từ tlx-worker/src/ (same monorepo).
// ============================================================
import express from "express";
import { WebSocketServer } from "ws";
import "dotenv/config";

import * as dbm from "../../tlx-worker/src/dbLayer.js";
import * as sm from "../../tlx-worker/src/sessionManager.js";
import { config } from "../../tlx-worker/src/config.js";

const PORT = Number(process.env.PORT || 8080);

if (!process.env.DATABASE_URL) {
  console.warn("⚠️  CẢNH BÁO: DATABASE_URL chưa đặt → dùng SQLite riêng.");
  console.warn("   Nếu tlx-worker dùng PostgreSQL, tài khoản admin duyệt sẽ KHÔNG phản ánh ở đây.");
  console.warn("   → Tài xế sẽ luôn thấy 'Chờ duyệt' dù đã được duyệt.");
  console.warn("   Hãy thêm DATABASE_URL=postgres://... vào tlx-driver-service/.env rồi restart.");
}

await dbm.ensureSeed();
await dbm.purgeOld();
config.voiceEnabled = (await dbm.getSetting("voice_enabled", "1")) === "1";
const _storedFptKey = await dbm.getSetting("fpt_stt_api_key", null);
if (_storedFptKey) config.fptSttApiKey = _storedFptKey;
setInterval(() => dbm.purgeOld().catch(() => {}), 6 * 3600 * 1000);

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

function tokenOf(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  const userId = dbm.userIdFromToken(token);
  return userId ? { userId, token } : null;
}

// ---------- Auth ----------
app.post("/api/register", async (req, res) => {
  try { res.json(await dbm.register(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
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

// ---------- Lịch sử cuốc ----------
app.get("/api/trips/saved", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json(await dbm.listSavedTrips(a.userId));
});

// ---------- Đăng nhập Zalo (QR) — chỉ cho tài xế ----------
const pendingQR = new Map();
app.post("/api/zalo/login-qr", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  const u = await dbm.getUserPublic(a.userId);
  if (u.status !== "active")
    return res.status(403).json({ error: "Tài khoản chưa được duyệt/đã hết hạn" });
  try {
    sm.loginQR(a.userId,
      (ev) => {
        if (ev?.type !== 0) return;
        const b64 = ev?.data?.image || null;
        if (b64) {
          pendingQR.set(a.userId, b64);
          pushToUser(a.userId, { type: "qr", image: b64 });
          console.log(`[QR] driver=${a.userId} len=${String(b64).length}`);
        }
      },
      pushToUser
    ).then(() => {
      pendingQR.delete(a.userId);
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
app.get("/api/zalo/pending-qr", (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json({ image: pendingQR.get(a.userId) || null });
});

// ---------- Public API — không cần đăng nhập ----------

// Chuyển tên nhóm thành slug URL-safe: bỏ dấu tiếng Việt, ký tự đặc biệt
function slugify(name) {
  return (name || "")
    .replace(/\{[^}]*\}|\([^)]*\)|\[[^\]]*\]/g, " ") // bỏ nội dung trong {}/[]/()
    .replace(/[đĐ]/g, "d")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

app.get("/api/public/groups", async (_req, res) => {
  try {
    const groups = await dbm.listPublicGroups();
    res.json(groups.map(g => ({ ...g, slug: slugify(g.group_name) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/public/by-slug/:slug", async (req, res) => {
  try {
    const groups = await dbm.listPublicGroups();
    const found = groups.find(g => slugify(g.group_name) === req.params.slug);
    if (!found) return res.status(404).json({ error: "Nhóm không tồn tại" });
    res.json({ ...found, slug: slugify(found.group_name) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/public/members/:groupId", async (req, res) => {
  try { res.json(await dbm.listMembersWithYesterday(req.params.groupId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/public/transactions/:groupId/:zaloUid", async (req, res) => {
  try {
    const { groupId, zaloUid } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    res.json(await dbm.listTransactions(groupId, { zaloUid, limit, approvedOnly: true }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/", (_req, res) => res.send("TLX Driver Service đang chạy (port 8080)"));
app.get("/health", (_req, res) => res.json({ ok: true, sessions: sm.sessionCount?.() ?? 0 }));

const server = app.listen(PORT, () => console.log(`🚗 Driver Service (HTTP+WS) cổng ${PORT}`));

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

  const pendingQrImg = pendingQR.get(userId);
  if (pendingQrImg) ws.send(JSON.stringify({ type: "qr", image: pendingQrImg }));

  ws.on("close", () => clientsByUser.get(userId)?.delete(ws));
  ws.on("message", (buf) => handleWs(userId, buf.toString()));
});

async function ensureZaloSession(userId) {
  if (sm.hasSession(userId)) return;
  // Chỉ khôi phục session cho tài xế — accountant do tlx-worker quản lý
  const u = await dbm.getUserPublic(userId).catch(() => null);
  if (!u || u.role !== "driver") return;
  const stored = await dbm.getZaloSession(userId);
  if (stored?.cookie) {
    try { await sm.startSessionFromStored(userId, pushToUser); console.log(`♻️  Khôi phục phiên Zalo tài xế ${userId}`); }
    catch (e) {
      console.error(`Không khôi phục phiên ${userId}:`, e?.message || e);
      // Cookie hết hạn → báo frontend hiện banner "Phiên Zalo đã hết hạn"
      pushToUser(userId, { type: "zalo_expired" });
    }
  }
}

async function handleWs(userId, raw) {
  let cmd; try { cmd = JSON.parse(raw); } catch { return; }
  if (cmd.action === "take") sm.takeTrip(userId, cmd);
  if (cmd.action === "cancel") sm.cancelTake(userId, cmd);
  if (cmd.action === "startZalo") ensureZaloSession(userId);
  if (cmd.action === "setGroups") sm.setWatchedGroups(userId, cmd.groupIds || []).catch(() => {});
}

console.log("✅ Driver Service sẵn sàng.");
