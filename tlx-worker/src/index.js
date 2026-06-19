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

const PORT = Number(process.env.PORT || 8080);

await dbm.ensureSeed();
await dbm.purgeOld();
setInterval(() => dbm.purgeOld().catch(()=>{}), 6 * 3600 * 1000);

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

// ---------- Admin ----------
app.get("/api/admin/users", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.listUsers()); });
app.post("/api/admin/approve", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.approveUser(req.body.id, req.body.plan)); });
app.post("/api/admin/renew", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.renewUser(req.body.id)); });
app.post("/api/admin/ban", async (req, res) => { if (!await requireAdmin(req, res)) return; res.json(await dbm.toggleBan(req.body.id)); });
app.post("/api/admin/set-role", async (req, res) => {
  const a = await requireAdmin(req, res); if (!a) return;
  if (req.body.id === a.userId && req.body.role !== "admin")
    return res.status(400).json({ error: "Không thể tự gỡ quyền admin của chính mình" });
  res.json(await dbm.setRole(req.body.id, req.body.role));
});

// ---------- Lịch sử cuốc ----------
app.get("/api/trips/saved", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  res.json(await dbm.listSavedTrips(a.userId));
});

// ---------- Đăng nhập Zalo (QR) ----------
const pendingQR = new Map();
app.post("/api/zalo/login-qr", async (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  const u = await dbm.getUserPublic(a.userId);
  if (u.status !== "active") return res.status(403).json({ error: "Tài khoản chưa được duyệt/đã hết hạn" });
  try {
    sm.loginQR(a.userId,
      (ev) => { const b64 = ev?.data?.image || ev?.image || null; if (b64) { pendingQR.set(a.userId, b64); pushToUser(a.userId, { type: "qr", image: b64 }); } },
      pushToUser
    ).then(() => pushToUser(a.userId, { type: "zalo_ready" }))
     .catch(e => pushToUser(a.userId, { type: "zalo_error", error: String(e?.message || e) }));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e?.message || e) }); }
});
app.post("/api/zalo/logout", (req, res) => {
  const a = tokenOf(req); if (!a) return res.status(401).json({ error: "Chưa đăng nhập" });
  sm.logoutZalo(a.userId);
  pushToUser(a.userId, { type: "zalo_logout" });
  res.json({ ok: true });
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

  ws.on("close", () => clientsByUser.get(userId)?.delete(ws));
  ws.on("message", (buf) => handleWs(userId, buf.toString()));
});

async function ensureZaloSession(userId) {
  if (sm.hasSession(userId)) return;
  const stored = await dbm.getZaloSession(userId);
  if (stored?.cookie) {
    try { await sm.startSessionFromStored(userId, pushToUser); console.log(`♻️  Khôi phục phiên Zalo ${userId}`); }
    catch (e) { console.error(`Không khôi phục phiên ${userId}:`, e?.message || e); }
  }
}

async function handleWs(userId, raw) {
  let cmd; try { cmd = JSON.parse(raw); } catch { return; }
  if (cmd.action === "setGroups") sm.setWatchedGroups(userId, cmd.groupIds || []);
  if (cmd.action === "take") sm.takeTrip(userId, cmd);
  if (cmd.action === "cancel") sm.cancelTake(userId, cmd);
  if (cmd.action === "startZalo") ensureZaloSession(userId);
}

console.log("✅ Sẵn sàng.");
