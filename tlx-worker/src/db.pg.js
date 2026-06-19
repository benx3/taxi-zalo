// ============================================================
// db.pg.js — Lưu trữ bằng PostgreSQL (cho production trên VPS)
// Cùng tên hàm với db.js (SQLite) nhưng TẤT CẢ là async.
//
// Cách dùng: trong code, đổi   import * as dbm from "./db.js"
//            thành             import * as dbm from "./db.pg.js"
// và thêm await ở các lời gọi (sessionManager/index đã được cập nhật cho async).
//
// Cần biến môi trường DATABASE_URL, ví dụ:
//   postgres://tlx:matkhau@localhost:5432/tlx
// ============================================================
import pg from "pg";
import crypto from "crypto";
import { hashPassword, verifyPassword, isLegacyHash, encryptSecret, decryptSecret } from "./crypto.js";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 20),     // số kết nối tối đa trong pool
  idleTimeoutMillis: 30000,
});

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const uid = () => crypto.randomUUID();
const now = () => Date.now();
const q = (text, params) => pool.query(text, params);

// ---------- Khởi tạo bảng ----------
export async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      phone       TEXT UNIQUE NOT NULL,
      pass_hash   TEXT NOT NULL,
      name        TEXT,
      role        TEXT DEFAULT 'driver',
      status      TEXT DEFAULT 'pending',
      plan        TEXT,
      expires_at  BIGINT,
      created_at  BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS zalo_sessions (
      user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cookie      TEXT,
      imei        TEXT,
      user_agent  TEXT,
      zalo_uid    TEXT,
      worker_id   TEXT,
      updated_at  BIGINT
    );
    CREATE TABLE IF NOT EXISTS saved_trips (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id    TEXT, group_name TEXT, sender TEXT, text TEXT,
      price       INTEGER, trip_type TEXT, route_from TEXT, route_to TEXT,
      status      TEXT DEFAULT 'pending',
      taken_at    BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_saved_user ON saved_trips(user_id, taken_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE TABLE IF NOT EXISTS transactions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_name  TEXT,
      plan       TEXT NOT NULL,
      amount     BIGINT NOT NULL DEFAULT 0,
      note       TEXT,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(created_at DESC);
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

const sessions = new Map(); // token -> userId (RAM; production lớn nên thay bằng Redis)

export async function ensureSeed() {
  const r = await q("SELECT id FROM users WHERE phone=$1", ["admin"]);
  if (r.rowCount === 0) {
    const hash = await hashPassword("admin");
    await q("INSERT INTO users (id,phone,pass_hash,name,role,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [uid(), "admin", hash, "Quản trị viên", "admin", "active", now()]);
    console.log("👤 Đã tạo tài khoản admin. Đăng nhập lần đầu và đổi mật khẩu ngay.");
  }
}

// ---------- Auth ----------
export async function register({ phone, pass, name }) {
  const ex = await q("SELECT 1 FROM users WHERE phone=$1", [phone]);
  if (ex.rowCount) throw new Error("SĐT đã đăng ký");
  const id = uid();
  const hash = await hashPassword(pass);
  await q("INSERT INTO users (id,phone,pass_hash,name,role,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [id, phone, hash, name, "driver", "pending", now()]);
  return getUserPublic(id);
}

export async function login({ phone, pass }) {
  const r = await q("SELECT * FROM users WHERE phone=$1", [phone]);
  const u = r.rows[0];
  if (!u || !(await verifyPassword(pass, u.pass_hash))) throw new Error("Sai tài khoản hoặc mật khẩu");
  if (isLegacyHash(u.pass_hash)) {
    try { const nh = await hashPassword(pass); await q("UPDATE users SET pass_hash=$1 WHERE id=$2", [nh, u.id]); } catch {}
  }
  await refreshStatus(u);
  const token = uid();
  sessions.set(token, u.id);
  return { token, user: await getUserPublic(u.id) };
}

export function userIdFromToken(token) { return sessions.get(token) || null; }
export function logout(token) { sessions.delete(token); }

async function refreshStatus(u) {
  if (u.role === "admin" || u.status === "banned") return;
  if (u.expires_at && Number(u.expires_at) < now() && u.status === "active") {
    await q("UPDATE users SET status='expired' WHERE id=$1", [u.id]);
  }
}

export async function getUserPublic(id) {
  const r = await q("SELECT * FROM users WHERE id=$1", [id]);
  const u = r.rows[0]; if (!u) return null;
  await refreshStatus(u);
  const r2 = await q("SELECT * FROM users WHERE id=$1", [id]);
  const f = r2.rows[0];
  const z = await q("SELECT 1 FROM zalo_sessions WHERE user_id=$1", [id]);
  return {
    id: f.id, phone: f.phone, name: f.name, role: f.role, status: f.status, plan: f.plan,
    daysLeft: f.expires_at ? Math.max(0, Math.ceil((Number(f.expires_at) - now()) / 86400000)) : 0,
    hasZalo: z.rowCount > 0,
  };
}

// ---------- Admin ----------
export async function listUsers() {
  const r = await q("SELECT id FROM users ORDER BY (role='admin') DESC, created_at DESC");
  return Promise.all(r.rows.map(x => getUserPublic(x.id)));
}
export async function approveUser(id, plan, amount = 0) {
  const days = plan === "Tháng" ? 30 : 7;
  await q("UPDATE users SET status='active', plan=$1, expires_at=$2 WHERE id=$3",
    [plan, now() + days * 86400000, id]);
  const u = await getUserPublic(id);
  await q("INSERT INTO transactions (id,user_id,user_name,plan,amount,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [uid(), id, u.name, plan, amount, "approve", now()]);
  return u;
}
export async function renewUser(id, amount = 0) {
  const r = await q("SELECT * FROM users WHERE id=$1", [id]); const u = r.rows[0];
  const days = u.plan === "Tháng" ? 30 : 7;
  const base = Math.max(now(), Number(u.expires_at) || now());
  await q("UPDATE users SET status='active', expires_at=$1 WHERE id=$2", [base + days * 86400000, id]);
  const pub = await getUserPublic(id);
  await q("INSERT INTO transactions (id,user_id,user_name,plan,amount,note,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [uid(), id, pub.name, u.plan, amount, "renew", now()]);
  return pub;
}
export async function toggleBan(id) {
  const r = await q("SELECT status FROM users WHERE id=$1", [id]);
  const s = r.rows[0].status === "banned" ? "active" : "banned";
  await q("UPDATE users SET status=$1 WHERE id=$2", [s, id]);
  return getUserPublic(id);
}
export async function changePassword(userId, oldPass, newPass) {
  const r = await q("SELECT pass_hash FROM users WHERE id=$1", [userId]);
  if (!r.rows[0]) throw new Error("Không tìm thấy tài khoản");
  if (!(await verifyPassword(oldPass, r.rows[0].pass_hash))) throw new Error("Mật khẩu hiện tại không đúng");
  if (!newPass || newPass.length < 3) throw new Error("Mật khẩu mới phải từ 3 ký tự");
  const hash = await hashPassword(newPass);
  await q("UPDATE users SET pass_hash=$1 WHERE id=$2", [hash, userId]);
  return { ok: true };
}
export async function setRole(id, role) {
  if (!["admin", "driver"].includes(role)) throw new Error("Vai trò không hợp lệ");
  await q("UPDATE users SET role=$1 WHERE id=$2", [role, id]);
  return getUserPublic(id);
}

// ---------- Admin: reset mật khẩu, thống kê ----------
export async function resetPassword(userId, newPass) {
  if (!newPass || newPass.length < 3) throw new Error("Mật khẩu phải từ 3 ký tự");
  const hash = await hashPassword(newPass);
  await q("UPDATE users SET pass_hash=$1 WHERE id=$2", [hash, userId]);
  return { ok: true };
}

export async function getRevenueStats(fromMs, toMs) {
  const r = await q(`
    SELECT to_char(to_timestamp(created_at/1000.0) + INTERVAL '7 hours', 'YYYY-MM-DD') as day,
      note, SUM(amount) as total, COUNT(*) as count
    FROM transactions WHERE created_at>=$1 AND created_at<=$2
    GROUP BY day, note ORDER BY day ASC
  `, [fromMs, toMs]);
  return r.rows;
}

export async function getUserStats(fromMs, toMs, status) {
  if (status && status !== "all") {
    const r = await q(`
      SELECT to_char(to_timestamp(created_at/1000.0) + INTERVAL '7 hours', 'YYYY-MM-DD') as day,
        status, COUNT(*) as count
      FROM users WHERE role='driver' AND created_at>=$1 AND created_at<=$2 AND status=$3
      GROUP BY day, status ORDER BY day ASC
    `, [fromMs, toMs, status]);
    return r.rows;
  }
  const r = await q(`
    SELECT to_char(to_timestamp(created_at/1000.0) + INTERVAL '7 hours', 'YYYY-MM-DD') as day,
      status, COUNT(*) as count
    FROM users WHERE role='driver' AND created_at>=$1 AND created_at<=$2
    GROUP BY day, status ORDER BY day ASC
  `, [fromMs, toMs]);
  return r.rows;
}

// ---------- Phiên Zalo ----------
export async function saveZaloSession(userId, { cookie, imei, userAgent, zaloUid }) {
  const encCookie = encryptSecret(JSON.stringify(cookie));
  await q(`INSERT INTO zalo_sessions (user_id,cookie,imei,user_agent,zalo_uid,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (user_id) DO UPDATE SET cookie=$2,imei=$3,user_agent=$4,zalo_uid=$5,updated_at=$6`,
    [userId, encCookie, imei, userAgent, zaloUid, now()]);
}
export async function getZaloSession(userId) {
  const r = await q("SELECT * FROM zalo_sessions WHERE user_id=$1", [userId]);
  const z = r.rows[0]; if (!z) return null;
  const raw = decryptSecret(z.cookie);
  return { cookie: JSON.parse(raw || "null"), imei: z.imei, userAgent: z.user_agent, zaloUid: z.zalo_uid };
}
export async function clearZaloSession(userId) {
  await q("DELETE FROM zalo_sessions WHERE user_id=$1", [userId]);
}

// ---------- Cuốc đã nhận ----------
export async function saveTrip(userId, trip, status = "pending") {
  const id = trip.savedId || uid();
  await q(`INSERT INTO saved_trips
    (id,user_id,group_id,group_name,sender,text,price,trip_type,route_from,route_to,status,taken_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO UPDATE SET status=$11`,
    [id, userId, trip.groupId, trip.group, trip.sender, trip.text, trip.price,
     trip.type, trip.route?.from || null, trip.route?.to || null, status, now()]);
  return id;
}
export async function markTripWon(savedId) {
  await q("UPDATE saved_trips SET status='won' WHERE id=$1", [savedId]);
}
export async function deleteSavedTrip(savedId) {
  await q("DELETE FROM saved_trips WHERE id=$1", [savedId]);
}
export async function listSavedTrips(userId, limit = 100) {
  const r = await q("SELECT * FROM saved_trips WHERE user_id=$1 ORDER BY taken_at DESC LIMIT $2", [userId, limit]);
  return r.rows;
}
export async function getSetting(key, defaultVal = null) {
  const r = await q("SELECT value FROM app_settings WHERE key=$1", [key]);
  return r.rowCount > 0 ? r.rows[0].value : defaultVal;
}
export async function setSetting(key, value) {
  await q("INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
    [key, String(value)]);
}

export async function purgeOld() {
  const cutoff = now() - 60 * 86400000;
  const r = await q("DELETE FROM saved_trips WHERE taken_at < $1", [cutoff]);
  if (r.rowCount) console.log(`🧹 Đã xoá ${r.rowCount} cuốc cũ hơn 2 tháng.`);
}

export default pool;
