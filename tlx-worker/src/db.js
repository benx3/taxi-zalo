// ============================================================
// db.js — Lưu trữ bằng SQLite (better-sqlite3)
// Bảng: users (tài khoản dịch vụ), zalo_sessions (phiên Zalo mỗi user),
//        saved_trips (cuốc đã nhận, giữ 2 tháng).
// Cuốc CHƯA nhận = rác, không lưu DB (chỉ ở RAM, tự trôi).
//
// Đổi sang PostgreSQL sau: chỉ cần thay file này, giữ nguyên các hàm export.
// ============================================================
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { hashPassword, verifyPassword, isLegacyHash, encryptSecret, decryptSecret } from "./crypto.js";

const DATA_DIR = process.env.DATA_DIR || "./data";
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "tlx.db"));
db.pragma("journal_mode = WAL");

// ---------- Khởi tạo bảng ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  phone       TEXT UNIQUE NOT NULL,
  pass_hash   TEXT NOT NULL,
  name        TEXT,
  role        TEXT DEFAULT 'driver',     -- driver | admin
  status      TEXT DEFAULT 'pending',    -- pending | active | expired | banned
  plan        TEXT,                      -- 'Tuần' | 'Tháng'
  expires_at  INTEGER,                   -- epoch ms; null nếu chưa cấp gói
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS zalo_sessions (
  user_id     TEXT PRIMARY KEY REFERENCES users(id),
  cookie      TEXT,                      -- JSON cookie (test: lưu thẳng; prod: mã hoá)
  imei        TEXT,
  user_agent  TEXT,
  zalo_uid    TEXT,                      -- selfId của phiên Zalo
  updated_at  INTEGER
);

CREATE TABLE IF NOT EXISTS saved_trips (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  group_id    TEXT,
  group_name  TEXT,
  sender      TEXT,
  text        TEXT,
  price       INTEGER,
  trip_type   TEXT,
  route_from  TEXT,
  route_to    TEXT,
  status      TEXT DEFAULT 'pending',    -- pending(đã xin) | won(được cuốc)
  taken_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_trips(user_id, taken_at DESC);
`);

const sessions = new Map(); // token -> userId (đăng nhập web)

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const uid = () => crypto.randomUUID();
const now = () => Date.now();

// ---------- Seed: tạo admin mặc định nếu chưa có ----------
export async function ensureSeed() {
  const admin = db.prepare("SELECT id FROM users WHERE phone=?").get("admin");
  if (!admin) {
    const hash = await hashPassword("admin");
    db.prepare("INSERT INTO users (id,phone,pass_hash,name,role,status,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(uid(), "admin", hash, "Quản trị viên", "admin", "active", now());
    console.log("👤 Đã tạo tài khoản admin. Đăng nhập lần đầu và đổi mật khẩu ngay.");
  }
}

// ---------- Auth ----------
export async function register({ phone, pass, name }) {
  if (db.prepare("SELECT 1 FROM users WHERE phone=?").get(phone)) throw new Error("SĐT đã đăng ký");
  const id = uid();
  const hash = await hashPassword(pass);
  db.prepare("INSERT INTO users (id,phone,pass_hash,name,role,status,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, phone, hash, name, "driver", "pending", now());
  return getUserPublic(id);
}

export async function login({ phone, pass }) {
  const u = db.prepare("SELECT * FROM users WHERE phone=?").get(phone);
  if (!u || !(await verifyPassword(pass, u.pass_hash))) throw new Error("Sai tài khoản hoặc mật khẩu");
  // tự nâng cấp hash cũ (SHA-256) sang bcrypt khi đăng nhập đúng
  if (isLegacyHash(u.pass_hash)) {
    try { const nh = await hashPassword(pass); db.prepare("UPDATE users SET pass_hash=? WHERE id=?").run(nh, u.id); } catch {}
  }
  refreshStatus(u);
  const token = uid();
  sessions.set(token, u.id);
  return { token, user: getUserPublic(u.id) };
}

export function userIdFromToken(token) { return sessions.get(token) || null; }
export function logout(token) { sessions.delete(token); }

// cập nhật trạng thái theo hạn dùng
function refreshStatus(u) {
  if (u.role === "admin") return;
  if (u.status === "banned") return;
  if (u.expires_at && u.expires_at < now() && u.status === "active") {
    db.prepare("UPDATE users SET status='expired' WHERE id=?").run(u.id);
    u.status = "expired";
  }
}

export function getUserPublic(id) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  if (!u) return null;
  refreshStatus(u);
  const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  return {
    id: fresh.id, phone: fresh.phone, name: fresh.name, role: fresh.role,
    status: fresh.status, plan: fresh.plan,
    daysLeft: fresh.expires_at ? Math.max(0, Math.ceil((fresh.expires_at - now()) / 86400000)) : 0,
    hasZalo: !!db.prepare("SELECT 1 FROM zalo_sessions WHERE user_id=?").get(id),
  };
}

// ---------- Admin ----------
export function listUsers() {
  // hiện tất cả (gồm admin) để có thể cấp/gỡ quyền; sắp admin lên đầu
  return db.prepare("SELECT * FROM users ORDER BY (role='admin') DESC, created_at DESC")
    .all().map(u => getUserPublic(u.id));
}
export function approveUser(id, plan) {
  const days = plan === "Tháng" ? 30 : 7;
  db.prepare("UPDATE users SET status='active', plan=?, expires_at=? WHERE id=?")
    .run(plan, now() + days * 86400000, id);
  return getUserPublic(id);
}
export function renewUser(id) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  const days = u.plan === "Tháng" ? 30 : 7;
  const base = Math.max(now(), u.expires_at || now());
  db.prepare("UPDATE users SET status='active', expires_at=? WHERE id=?").run(base + days * 86400000, id);
  return getUserPublic(id);
}
export function toggleBan(id) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  const s = u.status === "banned" ? "active" : "banned";
  db.prepare("UPDATE users SET status=? WHERE id=?").run(s, id);
  return getUserPublic(id);
}

// Đổi mật khẩu (cần đúng mật khẩu cũ)
export async function changePassword(userId, oldPass, newPass) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!u) throw new Error("Không tìm thấy tài khoản");
  if (!(await verifyPassword(oldPass, u.pass_hash))) throw new Error("Mật khẩu hiện tại không đúng");
  if (!newPass || newPass.length < 3) throw new Error("Mật khẩu mới phải từ 3 ký tự");
  const hash = await hashPassword(newPass);
  db.prepare("UPDATE users SET pass_hash=? WHERE id=?").run(hash, userId);
  return { ok: true };
}

// Cấp / gỡ quyền admin cho 1 user
export function setRole(id, role) {
  if (!["admin", "driver"].includes(role)) throw new Error("Vai trò không hợp lệ");
  db.prepare("UPDATE users SET role=? WHERE id=?").run(role, id);
  return getUserPublic(id);
}

// ---------- Phiên Zalo của user ----------
// Cookie Zalo được MÃ HOÁ (AES-256-GCM) trước khi lưu nếu có APP_SECRET.
export function saveZaloSession(userId, { cookie, imei, userAgent, zaloUid }) {
  const encCookie = encryptSecret(JSON.stringify(cookie));
  db.prepare(`INSERT INTO zalo_sessions (user_id,cookie,imei,user_agent,zalo_uid,updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET cookie=excluded.cookie, imei=excluded.imei,
      user_agent=excluded.user_agent, zalo_uid=excluded.zalo_uid, updated_at=excluded.updated_at`)
    .run(userId, encCookie, imei, userAgent, zaloUid, now());
}
export function getZaloSession(userId) {
  const r = db.prepare("SELECT * FROM zalo_sessions WHERE user_id=?").get(userId);
  if (!r) return null;
  const raw = decryptSecret(r.cookie);
  return { cookie: JSON.parse(raw || "null"), imei: r.imei, userAgent: r.user_agent, zaloUid: r.zalo_uid };
}
export function clearZaloSession(userId) {
  db.prepare("DELETE FROM zalo_sessions WHERE user_id=?").run(userId);
}
export function listUsersWithZalo() {
  return db.prepare(`SELECT u.id FROM users u JOIN zalo_sessions z ON z.user_id=u.id
    WHERE u.status='active'`).all().map(r => r.id);
}

// ---------- Cuốc đã nhận (lưu 2 tháng) ----------
export function saveTrip(userId, trip, status = "pending") {
  const id = trip.savedId || uid();
  db.prepare(`INSERT OR REPLACE INTO saved_trips
    (id,user_id,group_id,group_name,sender,text,price,trip_type,route_from,route_to,status,taken_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, userId, trip.groupId, trip.group, trip.sender, trip.text, trip.price,
         trip.type, trip.route?.from || null, trip.route?.to || null, status, now());
  return id;
}
export function markTripWon(savedId) {
  db.prepare("UPDATE saved_trips SET status='won' WHERE id=?").run(savedId);
}
export function deleteSavedTrip(savedId) {
  db.prepare("DELETE FROM saved_trips WHERE id=?").run(savedId);
}
export function listSavedTrips(userId, limit = 100) {
  return db.prepare("SELECT * FROM saved_trips WHERE user_id=? ORDER BY taken_at DESC LIMIT ?")
    .all(userId, limit);
}

// ---------- Dọn dữ liệu cũ > 2 tháng ----------
export function purgeOld() {
  const cutoff = now() - 60 * 86400000;
  const r = db.prepare("DELETE FROM saved_trips WHERE taken_at < ?").run(cutoff);
  if (r.changes) console.log(`🧹 Đã xoá ${r.changes} cuốc cũ hơn 2 tháng.`);
}

export default db;
