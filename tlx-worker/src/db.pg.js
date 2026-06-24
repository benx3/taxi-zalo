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
    CREATE TABLE IF NOT EXISTS accountant_groups (
      accountant_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id      TEXT NOT NULL,
      group_name    TEXT,
      PRIMARY KEY (accountant_id, group_id)
    );
    CREATE TABLE IF NOT EXISTS members (
      id           TEXT PRIMARY KEY,
      group_id     TEXT NOT NULL,
      zalo_uid     TEXT NOT NULL,
      phone        TEXT,
      display_name TEXT,
      avatar       TEXT,
      alias        TEXT,
      points       DOUBLE PRECISION DEFAULT 0,
      created_at   BIGINT NOT NULL,
      updated_at   BIGINT NOT NULL,
      UNIQUE(group_id, zalo_uid)
    );
    CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
    CREATE TABLE IF NOT EXISTS point_rules (
      group_id   TEXT PRIMARY KEY,
      rules_json TEXT NOT NULL DEFAULT '{"rules":[]}',
      raw_text   TEXT DEFAULT '',
      updated_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS point_transactions (
      id            TEXT PRIMARY KEY,
      group_id      TEXT NOT NULL,
      trip_msg_id   TEXT,
      from_member   TEXT,
      to_member     TEXT,
      points        DOUBLE PRECISION NOT NULL,
      reason        TEXT,
      type          TEXT DEFAULT 'manual',
      status        TEXT DEFAULT 'approved',
      requester_uid TEXT,
      raw_text      TEXT,
      created_at    BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ptx_group ON point_transactions(group_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ptx_from  ON point_transactions(from_member, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ptx_to    ON point_transactions(to_member,   created_at DESC);
  `);
  // Migration: thêm cột cho DB cũ (PostgreSQL hỗ trợ ADD COLUMN IF NOT EXISTS)
  await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS group_limit INTEGER DEFAULT 3");
  await q("ALTER TABLE users ADD COLUMN IF NOT EXISTS groups_locked INTEGER DEFAULT 0");
  await q("ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'");
  await q("ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS requester_uid TEXT");
  await q("ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS raw_text TEXT");
  await q("ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar TEXT");
  await q("ALTER TABLE members ADD COLUMN IF NOT EXISTS alias TEXT");
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
  // Migration: thêm cột public_visible nếu chưa có
  await q("ALTER TABLE accountant_groups ADD COLUMN IF NOT EXISTS public_visible INTEGER NOT NULL DEFAULT 1").catch(() => {});
  await q("ALTER TABLE accountant_groups ADD COLUMN IF NOT EXISTS zalo_group_id TEXT").catch(() => {});
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
    group_limit: f.group_limit ?? 3,
    groups_locked: (f.groups_locked ?? 0) === 1,
    daysLeft: f.expires_at ? Math.max(0, Math.ceil((Number(f.expires_at) - now()) / 86400000)) : 0,
    hasZalo: z.rowCount > 0,
  };
}

// ---------- Admin ----------
export async function listUsers() {
  const r = await q("SELECT id FROM users ORDER BY (role='admin') DESC, created_at DESC");
  return Promise.all(r.rows.map(x => getUserPublic(x.id)));
}
export async function listUsersWithZalo() {
  const r = await q(`SELECT u.id FROM users u JOIN zalo_sessions z ON z.user_id=u.id
    WHERE u.status='active' OR u.role IN ('accountant','admin')`);
  return r.rows.map(x => x.id);
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
export async function setRole(id, role, groupLimit) {
  if (!["admin", "driver", "accountant"].includes(role)) throw new Error("Vai trò không hợp lệ");
  if (role === "accountant") {
    await q("UPDATE users SET role=$1, status='active', group_limit=$2, groups_locked=0 WHERE id=$3",
      [role, Number(groupLimit) || 3, id]);
  } else {
    await q("UPDATE users SET role=$1 WHERE id=$2", [role, id]);
  }
  return getUserPublic(id);
}

export async function deleteUser(id) {
  const r = await q("SELECT role FROM users WHERE id=$1", [id]);
  if (!r.rows[0]) throw new Error("Tài khoản không tồn tại");
  if (r.rows[0].role === "admin") throw new Error("Không thể xóa tài khoản Admin");
  await q("DELETE FROM zalo_sessions WHERE user_id=$1", [id]);
  await q("DELETE FROM saved_trips WHERE user_id=$1", [id]);
  await q("DELETE FROM accountant_groups WHERE accountant_id=$1", [id]);
  await q("DELETE FROM transactions WHERE user_id=$1", [id]);
  await q("DELETE FROM users WHERE id=$1", [id]);
  return { ok: true };
}

export async function lockAccountantGroups(userId) {
  await q("UPDATE users SET groups_locked=1 WHERE id=$1", [userId]);
}
export async function isGroupsLocked(userId) {
  const r = await q("SELECT groups_locked FROM users WHERE id=$1", [userId]);
  return (r.rows[0]?.groups_locked ?? 0) === 1;
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
      SELECT id, name, phone, status,
        to_char(to_timestamp(created_at/1000.0) + INTERVAL '7 hours', 'YYYY-MM-DD') as day, created_at
      FROM users WHERE role='driver' AND created_at>=$1 AND created_at<=$2 AND status=$3
      ORDER BY created_at DESC
    `, [fromMs, toMs, status]);
    return r.rows;
  }
  const r = await q(`
    SELECT id, name, phone, status,
      to_char(to_timestamp(created_at/1000.0) + INTERVAL '7 hours', 'YYYY-MM-DD') as day, created_at
    FROM users WHERE role='driver' AND created_at>=$1 AND created_at<=$2
    ORDER BY created_at DESC
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

// ---------- Kế toán: nhóm phụ trách ----------
export async function listPublicGroups() {
  const r = await q("SELECT group_id, MAX(group_name) as group_name FROM accountant_groups WHERE public_visible=1 GROUP BY group_id ORDER BY MAX(group_name) ASC");
  return r.rows;
}
export async function getAccountantGroups(accountantId) {
  const r = await q("SELECT * FROM accountant_groups WHERE accountant_id=$1", [accountantId]);
  return r.rows;
}
export async function getGroupAccountants(groupId) {
  const r = await q(`
    SELECT ag.accountant_id, ag.zalo_group_id,
           u.username, u.full_name
    FROM accountant_groups ag
    JOIN users u ON u.id = ag.accountant_id
    WHERE ag.group_id = $1
    ORDER BY u.username ASC
  `, [groupId]);
  return r.rows;
}
export async function setGroupPublicVisible(accountantId, groupId, visible) {
  await q("UPDATE accountant_groups SET public_visible=$1 WHERE accountant_id=$2 AND group_id=$3",
    [visible ? 1 : 0, accountantId, groupId]);
}
export async function findGroupByName(name) {
  if (!name) return null;
  const r = await q("SELECT group_id FROM accountant_groups WHERE LOWER(TRIM(group_name))=LOWER(TRIM($1)) LIMIT 1", [name]);
  return r.rows[0] || null;
}
export async function addAccountantGroup(accountantId, groupId, groupName, zaloGroupId = null) {
  await q("INSERT INTO accountant_groups(accountant_id,group_id,group_name,zalo_group_id) VALUES($1,$2,$3,$4) ON CONFLICT(accountant_id,group_id) DO UPDATE SET group_name=$3, zalo_group_id=$4",
    [accountantId, groupId, groupName || groupId, zaloGroupId || null]);
}
export async function removeAccountantGroup(accountantId, groupId) {
  await q("DELETE FROM accountant_groups WHERE accountant_id=$1 AND group_id=$2", [accountantId, groupId]);
}

// ---------- Kế toán: thành viên ----------
export async function countMembers(groupId) {
  const r = await q("SELECT COUNT(*) as cnt FROM members WHERE group_id=$1", [groupId]);
  return Number(r.rows[0]?.cnt ?? 0);
}
export async function listMembers(groupId) {
  const r = await q("SELECT * FROM members WHERE group_id=$1 ORDER BY points DESC, display_name ASC", [groupId]);
  return r.rows;
}
export async function listMembersWithYesterday(groupId) {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const todayStartMs = Math.floor((Date.now() + vnOffsetMs) / 86400000) * 86400000 - vnOffsetMs;
  const r = await q(`
    SELECT m.*,
      ROUND(CAST(m.points AS numeric) - COALESCE((
        SELECT SUM(CASE WHEN pt.to_member = m.zalo_uid THEN pt.points ELSE -pt.points END)
        FROM point_transactions pt
        WHERE pt.group_id = m.group_id
          AND (pt.to_member = m.zalo_uid OR pt.from_member = m.zalo_uid)
          AND (pt.status IS NULL OR pt.status NOT IN ('pending','rejected'))
          AND pt.created_at >= $2
      ), 0), 10) AS points_yesterday
    FROM members m
    WHERE m.group_id = $1
    ORDER BY m.points DESC, m.display_name ASC
  `, [groupId, todayStartMs]);
  return r.rows;
}
export async function getMemberByZaloUid(groupId, zaloUid) {
  const r = await q("SELECT * FROM members WHERE group_id=$1 AND zalo_uid=$2", [groupId, zaloUid]);
  return r.rows[0] || null;
}
export async function upsertMember(groupId, zaloUid, { phone, display_name, avatar } = {}) {
  const r = await q(`
    INSERT INTO members(id,group_id,zalo_uid,phone,display_name,avatar,points,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,0,$7,$7)
    ON CONFLICT(group_id,zalo_uid) DO UPDATE
      SET phone=COALESCE($4,members.phone),
          display_name=COALESCE($5,members.display_name),
          avatar=COALESCE($6,members.avatar),
          updated_at=$7
    RETURNING id`,
    [uid(), groupId, zaloUid, phone || null, display_name || null, avatar || null, now()]);
  return r.rows[0].id;
}
export async function setMemberAlias(groupId, zaloUid, alias) {
  await q("UPDATE members SET alias=$1, updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4",
    [alias || null, now(), groupId, zaloUid]);
}
export async function deleteRemovedMembers(groupId, activeUids) {
  if (!activeUids.length) return 0;
  const r = await q(
    `DELETE FROM members WHERE group_id=$1 AND zalo_uid != ALL($2)`,
    [groupId, activeUids]
  );
  return r.rowCount;
}

// ---------- Kế toán: giao dịch điểm ----------
export async function adjustPoints(groupId, zaloUid, delta, reason, type = "manual", tripMsgId = null, fromMember = null, toMember = null, rawText = null) {
  await upsertMember(groupId, zaloUid);
  await q("UPDATE members SET points=ROUND(CAST(points+$1 AS numeric),10), updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4",
    [delta, now(), groupId, zaloUid]);
  if (fromMember === null && toMember === null) {
    if (delta >= 0) toMember = zaloUid;
    else fromMember = zaloUid;
  }
  const txId = uid();
  await q("INSERT INTO point_transactions(id,group_id,trip_msg_id,from_member,to_member,points,reason,type,raw_text,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [txId, groupId, tripMsgId, fromMember, toMember, Math.abs(delta), reason || null, type, rawText || null, now()]);
  return txId;
}
export async function listTransactions(groupId, { zaloUid, limit = 100 } = {}) {
  const base = `SELECT pt.*, fm.display_name as from_member_name, tm.display_name as to_member_name
    FROM point_transactions pt
    LEFT JOIN members fm ON fm.group_id=pt.group_id AND fm.zalo_uid=pt.from_member
    LEFT JOIN members tm ON tm.group_id=pt.group_id AND tm.zalo_uid=pt.to_member`;
  if (zaloUid) {
    const r = await q(`${base} WHERE pt.group_id=$1 AND (pt.from_member=$2 OR pt.to_member=$2) ORDER BY pt.created_at DESC LIMIT $3`,
      [groupId, zaloUid, limit]);
    return r.rows;
  }
  const r = await q(`${base} WHERE pt.group_id=$1 ORDER BY pt.created_at DESC LIMIT $2`, [groupId, limit]);
  return r.rows;
}
export async function updateTransaction(id, { reason, points }) {
  const r = await q("SELECT * FROM point_transactions WHERE id=$1", [id]);
  const tx = r.rows[0]; if (!tx) throw new Error("Không tìm thấy giao dịch");
  const diff = (points !== undefined ? points : tx.points) - tx.points;
  if (points !== undefined && diff !== 0) {
    if (tx.to_member) await q("UPDATE members SET points=ROUND(CAST(points-$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4", [diff, now(), tx.group_id, tx.to_member]);
    if (tx.from_member) await q("UPDATE members SET points=ROUND(CAST(points+$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4", [diff, now(), tx.group_id, tx.from_member]);
  }
  await q("UPDATE point_transactions SET reason=COALESCE($1,reason), points=COALESCE($2,points) WHERE id=$3",
    [reason || null, points !== undefined ? points : null, id]);
}
export async function deleteTransaction(id) {
  const r = await q("SELECT * FROM point_transactions WHERE id=$1", [id]);
  const tx = r.rows[0]; if (!tx) throw new Error("Không tìm thấy giao dịch");
  if (tx.to_member) await q("UPDATE members SET points=ROUND(CAST(points-$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4", [tx.points, now(), tx.group_id, tx.to_member]);
  if (tx.from_member) await q("UPDATE members SET points=ROUND(CAST(points+$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4", [tx.points, now(), tx.group_id, tx.from_member]);
  await q("DELETE FROM point_transactions WHERE id=$1", [id]);
}

// ---------- Kế toán: giao dịch chờ duyệt ----------
export async function createPendingTransfer(groupId, fromUid, toUid, points, rawText, msgId = null) {
  if (msgId) {
    const exists = await q("SELECT id FROM point_transactions WHERE group_id=$1 AND trip_msg_id=$2 AND status='pending'", [groupId, msgId]);
    if (exists.rows[0]) return exists.rows[0].id;
  }
  const txId = uid();
  await q(`INSERT INTO point_transactions
    (id,group_id,trip_msg_id,from_member,to_member,points,reason,type,status,requester_uid,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [txId, groupId, msgId || null, fromUid, toUid || null, Math.abs(points), rawText || null,
      "manual", "pending", fromUid, now()]);
  return txId;
}

export async function listPendingTransfers(groupId) {
  const r = await q(`
    SELECT pt.*,
      COALESCE(fm.alias, fm.display_name) as from_member_name, fm.points as from_points,
      COALESCE(tm.alias, tm.display_name) as to_member_name,   tm.points as to_points
    FROM point_transactions pt
    LEFT JOIN members fm ON fm.group_id=pt.group_id AND fm.zalo_uid=pt.from_member
    LEFT JOIN members tm ON tm.group_id=pt.group_id AND tm.zalo_uid=pt.to_member
    WHERE pt.group_id=$1 AND pt.status='pending' ORDER BY pt.created_at DESC`,
    [groupId]);
  return r.rows;
}

export async function approvePendingTransfer(txId) {
  const r = await q("SELECT * FROM point_transactions WHERE id=$1 AND status='pending'", [txId]);
  const tx = r.rows[0]; if (!tx) throw new Error("Không tìm thấy giao dịch đang chờ");
  if (tx.from_member) {
    await upsertMember(tx.group_id, tx.from_member);
    await q("UPDATE members SET points=ROUND(CAST(points-$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4",
      [tx.points, now(), tx.group_id, tx.from_member]);
  }
  if (tx.to_member) {
    await upsertMember(tx.group_id, tx.to_member);
    await q("UPDATE members SET points=ROUND(CAST(points+$1 AS numeric),10),updated_at=$2 WHERE group_id=$3 AND zalo_uid=$4",
      [tx.points, now(), tx.group_id, tx.to_member]);
  }
  await q("UPDATE point_transactions SET status='approved' WHERE id=$1", [txId]);
}

export async function rejectPendingTransfer(txId) {
  const r = await q("SELECT id FROM point_transactions WHERE id=$1 AND status='pending'", [txId]);
  if (!r.rows[0]) throw new Error("Không tìm thấy giao dịch đang chờ");
  await q("UPDATE point_transactions SET status='rejected' WHERE id=$1", [txId]);
}

// ---------- Kế toán: account KT của nhóm (để auto san điểm) ----------
export async function getGroupKtUid(groupId) {
  return (await getSetting(`kt_uid_${groupId}`, null)) || null;
}
export async function setGroupKtUid(groupId, uid) {
  return setSetting(`kt_uid_${groupId}`, uid || "");
}

// ---------- Kế toán: barem ----------
export async function getRules(groupId) {
  const r = await q("SELECT * FROM point_rules WHERE group_id=$1", [groupId]);
  return r.rows[0] || null;
}
export async function saveRules(groupId, rulesJson, rawText) {
  await q(`INSERT INTO point_rules(group_id,rules_json,raw_text,updated_at) VALUES($1,$2,$3,$4)
    ON CONFLICT(group_id) DO UPDATE SET rules_json=$2, raw_text=$3, updated_at=$4`,
    [groupId, rulesJson, rawText || "", now()]);
}

// ---------- Admin: merge nhóm ----------
export async function listAllGroups() {
  const r = await q(`
    SELECT ag.group_id, MAX(ag.group_name) as group_name,
           COUNT(DISTINCT ag.accountant_id) as accountant_count,
           COUNT(DISTINCT m.id) as member_count
    FROM accountant_groups ag
    LEFT JOIN members m ON m.group_id = ag.group_id
    GROUP BY ag.group_id
    ORDER BY MAX(ag.group_name) ASC
  `);
  return r.rows;
}
export async function mergeGroups(sourceGroupId, targetGroupId) {
  if (sourceGroupId === targetGroupId) throw new Error("Không thể merge nhóm với chính nó");
  const hasSource = await q("SELECT 1 FROM accountant_groups WHERE group_id=$1 LIMIT 1", [sourceGroupId]);
  if (!hasSource.rows.length) throw new Error("Nhóm nguồn không tồn tại");
  // Di chuyển members chưa có trong target
  await q(`
    INSERT INTO members(id,group_id,zalo_uid,phone,display_name,avatar,alias,points,created_at,updated_at)
    SELECT gen_random_uuid(), $2, s.zalo_uid, s.phone, s.display_name, s.avatar, s.alias, s.points, s.created_at, s.updated_at
    FROM members s
    WHERE s.group_id=$1
      AND NOT EXISTS (SELECT 1 FROM members t WHERE t.group_id=$2 AND t.zalo_uid=s.zalo_uid)
  `, [sourceGroupId, targetGroupId]);
  await q("DELETE FROM members WHERE group_id=$1", [sourceGroupId]);
  // Di chuyển transactions
  await q("UPDATE point_transactions SET group_id=$1 WHERE group_id=$2", [targetGroupId, sourceGroupId]);
  // Barem
  const tRules = await q("SELECT 1 FROM point_rules WHERE group_id=$1", [targetGroupId]);
  if (!tRules.rows.length) {
    await q("UPDATE point_rules SET group_id=$1 WHERE group_id=$2", [targetGroupId, sourceGroupId]);
  } else {
    await q("DELETE FROM point_rules WHERE group_id=$1", [sourceGroupId]);
  }
  // accountant_groups
  await q(`
    INSERT INTO accountant_groups(accountant_id, group_id, group_name, public_visible)
    SELECT accountant_id, $2, group_name, COALESCE(public_visible, 1)
    FROM accountant_groups WHERE group_id=$1
    ON CONFLICT(accountant_id, group_id) DO NOTHING
  `, [sourceGroupId, targetGroupId]);
  await q("DELETE FROM accountant_groups WHERE group_id=$1", [sourceGroupId]);
  // KT UID setting
  const tKt = await getSetting(`kt_uid_${targetGroupId}`, null);
  const sKt = await getSetting(`kt_uid_${sourceGroupId}`, null);
  if (!tKt && sKt) await setSetting(`kt_uid_${targetGroupId}`, sKt);
  await setSetting(`kt_uid_${sourceGroupId}`, "");
  return { ok: true };
}

export async function resetGroupData(groupId) {
  await q("UPDATE members SET points=0 WHERE group_id=$1", [groupId]);
  await q("DELETE FROM point_transactions WHERE group_id=$1", [groupId]);
  return { ok: true };
}

export async function purgeOld() {
  const cutoff = now() - 60 * 86400000;
  const r = await q("DELETE FROM saved_trips WHERE taken_at < $1", [cutoff]);
  if (r.rowCount) console.log(`🧹 Đã xoá ${r.rowCount} cuốc cũ hơn 2 tháng.`);
}

export default pool;
