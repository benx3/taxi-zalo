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

CREATE TABLE IF NOT EXISTS transactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  user_name  TEXT,
  plan       TEXT NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 0,
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ===== KẾ TOÁN =====

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
  points       REAL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE(group_id, zalo_uid)
);
CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);

CREATE TABLE IF NOT EXISTS point_rules (
  group_id   TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL DEFAULT '{"rules":[]}',
  raw_text   TEXT DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL,
  trip_msg_id   TEXT,
  from_member   TEXT,
  to_member     TEXT,
  points        REAL NOT NULL,
  reason        TEXT,
  type          TEXT DEFAULT 'manual',
  status        TEXT DEFAULT 'approved',
  requester_uid TEXT,
  raw_text      TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ptx_group ON point_transactions(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptx_from  ON point_transactions(from_member, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ptx_to    ON point_transactions(to_member,   created_at DESC);
`);

// Migration: thêm cột mới cho DB cũ (SQLite không hỗ trợ ADD IF NOT EXISTS)
try { db.exec("ALTER TABLE users ADD COLUMN group_limit INTEGER DEFAULT 3"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN groups_locked INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE point_transactions ADD COLUMN status TEXT DEFAULT 'approved'"); } catch {}
try { db.exec("ALTER TABLE point_transactions ADD COLUMN requester_uid TEXT"); } catch {}
try { db.exec("ALTER TABLE point_transactions ADD COLUMN raw_text TEXT"); } catch {}
try { db.exec("ALTER TABLE members ADD COLUMN avatar TEXT"); } catch {}
try { db.exec("ALTER TABLE members ADD COLUMN alias TEXT"); } catch {}

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
  try { db.prepare("ALTER TABLE accountant_groups ADD COLUMN public_visible INTEGER DEFAULT 1").run(); } catch {}
  // zalo_group_id: ID thực tế Zalo trả về cho session này (có thể khác canonical group_id)
  try { db.prepare("ALTER TABLE accountant_groups ADD COLUMN zalo_group_id TEXT").run(); } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS raw_messages (
    msg_id      TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL,
    sender_id   TEXT,
    sender_name TEXT,
    text        TEXT,
    msg_type    INTEGER DEFAULT 0,
    created_at  INTEGER NOT NULL
  )`);
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
    group_limit: fresh.group_limit ?? 3,
    groups_locked: (fresh.groups_locked ?? 0) === 1,
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
export function approveUser(id, plan, amount = 0) {
  const days = plan === "Tháng" ? 30 : 7;
  db.prepare("UPDATE users SET status='active', plan=?, expires_at=? WHERE id=?")
    .run(plan, now() + days * 86400000, id);
  const u = getUserPublic(id);
  db.prepare("INSERT INTO transactions (id,user_id,user_name,plan,amount,note,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(uid(), id, u.name, plan, amount, "approve", now());
  return u;
}
export function renewUser(id, amount = 0) {
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(id);
  const days = u.plan === "Tháng" ? 30 : 7;
  const base = Math.max(now(), u.expires_at || now());
  db.prepare("UPDATE users SET status='active', expires_at=? WHERE id=?").run(base + days * 86400000, id);
  const pub = getUserPublic(id);
  db.prepare("INSERT INTO transactions (id,user_id,user_name,plan,amount,note,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(uid(), id, pub.name, u.plan, amount, "renew", now());
  return pub;
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

// Cấp / gỡ quyền
export function setRole(id, role, groupLimit) {
  if (!["admin", "driver", "accountant"].includes(role)) throw new Error("Vai trò không hợp lệ");
  if (role === "accountant") {
    // Tự activate, reset groups_locked để kế toán chọn lại nhóm
    db.prepare("UPDATE users SET role=?, status='active', group_limit=?, groups_locked=0 WHERE id=?")
      .run(role, Number(groupLimit) || 3, id);
  } else {
    db.prepare("UPDATE users SET role=? WHERE id=?").run(role, id);
  }
  return getUserPublic(id);
}

export function deleteUser(id) {
  const u = db.prepare("SELECT role FROM users WHERE id=?").get(id);
  if (!u) throw new Error("Tài khoản không tồn tại");
  if (u.role === "admin") throw new Error("Không thể xóa tài khoản Admin");
  db.transaction(() => {
    db.prepare("DELETE FROM zalo_sessions WHERE user_id=?").run(id);
    db.prepare("DELETE FROM saved_trips WHERE user_id=?").run(id);
    db.prepare("DELETE FROM accountant_groups WHERE accountant_id=?").run(id);
    db.prepare("DELETE FROM transactions WHERE user_id=?").run(id);
    db.prepare("DELETE FROM users WHERE id=?").run(id);
  })();
  // Xóa token in-memory
  for (const [tok, uid] of sessions) { if (uid === id) sessions.delete(tok); }
  return { ok: true };
}

export function lockAccountantGroups(userId) {
  db.prepare("UPDATE users SET groups_locked=1 WHERE id=?").run(userId);
}
export function isGroupsLocked(userId) {
  const r = db.prepare("SELECT groups_locked FROM users WHERE id=?").get(userId);
  return (r?.groups_locked ?? 0) === 1;
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
    WHERE u.status='active' OR u.role IN ('accountant','admin')`).all().map(r => r.id);
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

// ---------- Admin: reset mật khẩu, thống kê ----------
export async function resetPassword(userId, newPass) {
  if (!newPass || newPass.length < 3) throw new Error("Mật khẩu phải từ 3 ký tự");
  const hash = await hashPassword(newPass);
  db.prepare("UPDATE users SET pass_hash=? WHERE id=?").run(hash, userId);
  return { ok: true };
}

export function getRevenueStats(fromMs, toMs) {
  return db.prepare(`
    SELECT date(created_at/1000,'unixepoch','+7 hours') as day,
      note, SUM(amount) as total, COUNT(*) as count
    FROM transactions WHERE created_at>=? AND created_at<=?
    GROUP BY day, note ORDER BY day ASC
  `).all(fromMs, toMs);
}

export function getUserStats(fromMs, toMs, status) {
  if (status && status !== "all") {
    return db.prepare(`
      SELECT id, name, phone, status,
        date(created_at/1000,'unixepoch','+7 hours') as day, created_at
      FROM users WHERE role='driver' AND created_at>=? AND created_at<=? AND status=?
      ORDER BY created_at DESC
    `).all(fromMs, toMs, status);
  }
  return db.prepare(`
    SELECT id, name, phone, status,
      date(created_at/1000,'unixepoch','+7 hours') as day, created_at
    FROM users WHERE role='driver' AND created_at>=? AND created_at<=?
    ORDER BY created_at DESC
  `).all(fromMs, toMs);
}

// ---------- Cài đặt ứng dụng ----------
export function getSetting(key, defaultVal = null) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key=?").get(key);
  return row ? row.value : defaultVal;
}
export function setSetting(key, value) {
  db.prepare("INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, String(value));
}

// ---------- Admin: merge nhóm ----------
export function listAllGroups() {
  return db.prepare(`
    SELECT ag.group_id, MAX(ag.group_name) as group_name,
           COUNT(DISTINCT ag.accountant_id) as accountant_count,
           COUNT(DISTINCT m.id) as member_count
    FROM accountant_groups ag
    LEFT JOIN members m ON m.group_id = ag.group_id
    GROUP BY ag.group_id
    ORDER BY MAX(ag.group_name) COLLATE NOCASE ASC
  `).all();
}
export function mergeGroups(sourceGroupId, targetGroupId) {
  if (sourceGroupId === targetGroupId) throw new Error("Không thể merge nhóm với chính nó");
  const hasSource = db.prepare("SELECT 1 FROM accountant_groups WHERE group_id=?").get(sourceGroupId);
  if (!hasSource) throw new Error("Nhóm nguồn không tồn tại");
  db.transaction(() => {
    // Di chuyển members chưa có trong target
    const sourceMembers = db.prepare("SELECT * FROM members WHERE group_id=?").all(sourceGroupId);
    for (const m of sourceMembers) {
      const exists = db.prepare("SELECT 1 FROM members WHERE group_id=? AND zalo_uid=?").get(targetGroupId, m.zalo_uid);
      if (!exists) {
        db.prepare("INSERT INTO members(id,group_id,zalo_uid,phone,display_name,avatar,alias,points,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
          .run(uid(), targetGroupId, m.zalo_uid, m.phone, m.display_name, m.avatar, m.alias, m.points, m.created_at, m.updated_at);
      }
    }
    db.prepare("DELETE FROM members WHERE group_id=?").run(sourceGroupId);
    // Di chuyển transactions và pending transfers
    db.prepare("UPDATE point_transactions SET group_id=? WHERE group_id=?").run(targetGroupId, sourceGroupId);
    // Barem: giữ target nếu có, nếu không thì lấy source
    const targetRules = db.prepare("SELECT 1 FROM point_rules WHERE group_id=?").get(targetGroupId);
    if (!targetRules) {
      db.prepare("UPDATE point_rules SET group_id=? WHERE group_id=?").run(targetGroupId, sourceGroupId);
    } else {
      db.prepare("DELETE FROM point_rules WHERE group_id=?").run(sourceGroupId);
    }
    // Cập nhật accountant_groups
    const sourceAcct = db.prepare("SELECT * FROM accountant_groups WHERE group_id=?").all(sourceGroupId);
    for (const ag of sourceAcct) {
      const exists = db.prepare("SELECT 1 FROM accountant_groups WHERE accountant_id=? AND group_id=?").get(ag.accountant_id, targetGroupId);
      if (!exists) {
        db.prepare("INSERT INTO accountant_groups(accountant_id,group_id,group_name,public_visible) VALUES(?,?,?,?)")
          .run(ag.accountant_id, targetGroupId, ag.group_name, ag.public_visible ?? 1);
      }
    }
    db.prepare("DELETE FROM accountant_groups WHERE group_id=?").run(sourceGroupId);
    // KT UID setting
    const tKt = getSetting(`kt_uid_${targetGroupId}`, null);
    const sKt = getSetting(`kt_uid_${sourceGroupId}`, null);
    if (!tKt && sKt) setSetting(`kt_uid_${targetGroupId}`, sKt);
    setSetting(`kt_uid_${sourceGroupId}`, "");
  })();
  return { ok: true };
}

export function resetGroupData(groupId) {
  db.transaction(() => {
    db.prepare("UPDATE members SET points=0 WHERE group_id=?").run(groupId);
    db.prepare("DELETE FROM point_transactions WHERE group_id=?").run(groupId);
  })();
  return { ok: true };
}

// ---------- Raw messages: audit log + anti-cheat + catchup ----------
export function listRawMessages(groupId, { dateFrom, dateTo, search, limit = 500 } = {}) {
  let sql = "SELECT * FROM raw_messages WHERE group_id=?";
  const params = [groupId];
  if (dateFrom) { sql += " AND created_at >= ?"; params.push(dateFrom); }
  if (dateTo)   { sql += " AND created_at <= ?"; params.push(dateTo); }
  if (search)   { sql += " AND LOWER(text) LIKE ?"; params.push("%" + search.toLowerCase() + "%"); }
  sql += " ORDER BY created_at ASC LIMIT ?";
  params.push(limit);
  return db.prepare(sql).all(...params);
}
export function saveRawMessage(msgId, groupId, senderId, senderName, text, msgType, ts) {
  if (!msgId || msgId.length < 3) return;
  try {
    db.prepare("INSERT OR IGNORE INTO raw_messages(msg_id,group_id,sender_id,sender_name,text,msg_type,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(msgId, groupId, senderId || null, senderName || null, text || null, msgType || 0, ts || now());
  } catch {}
}
export function hasRawMessage(msgId) {
  if (!msgId) return false;
  return !!db.prepare("SELECT 1 FROM raw_messages WHERE msg_id=?").get(msgId);
}

// ---------- Dọn dữ liệu cũ ----------
export function purgeOld() {
  const cutoff = now() - 60 * 86400000;
  const r = db.prepare("DELETE FROM saved_trips WHERE taken_at < ?").run(cutoff);
  if (r.changes) console.log(`🧹 Đã xoá ${r.changes} cuốc cũ hơn 2 tháng.`);
  const r2 = db.prepare("DELETE FROM raw_messages WHERE created_at < ?").run(now() - 3 * 86400000);
  if (r2.changes) console.log(`🧹 Đã xoá ${r2.changes} raw messages cũ hơn 3 ngày.`);
}

// ---------- Kế toán: nhóm phụ trách ----------
export function listPublicGroups() {
  return db.prepare(
    "SELECT group_id, MAX(group_name) as group_name FROM accountant_groups WHERE public_visible=1 GROUP BY group_id ORDER BY MAX(group_name) COLLATE NOCASE ASC"
  ).all();
}
export function getAccountantGroups(accountantId) {
  return db.prepare("SELECT * FROM accountant_groups WHERE accountant_id=?").all(accountantId);
}
export function getGroupAccountants(groupId) {
  return db.prepare(`
    SELECT ag.accountant_id, ag.zalo_group_id,
           u.phone, u.name
    FROM accountant_groups ag
    JOIN users u ON u.id = ag.accountant_id
    WHERE ag.group_id = ?
    ORDER BY u.phone COLLATE NOCASE ASC
  `).all(groupId);
}
export function setGroupPublicVisible(accountantId, groupId, visible) {
  db.prepare("UPDATE accountant_groups SET public_visible=? WHERE accountant_id=? AND group_id=?")
    .run(visible ? 1 : 0, accountantId, groupId);
}
export function findGroupByName(name) {
  if (!name) return null;
  return db.prepare("SELECT group_id FROM accountant_groups WHERE LOWER(TRIM(group_name))=LOWER(TRIM(?)) LIMIT 1").get(name) || null;
}
export function addAccountantGroup(accountantId, groupId, groupName, zaloGroupId = null) {
  db.prepare("INSERT OR REPLACE INTO accountant_groups(accountant_id,group_id,group_name,zalo_group_id) VALUES(?,?,?,?)")
    .run(accountantId, groupId, groupName || groupId, zaloGroupId || null);
}
export function removeAccountantGroup(accountantId, groupId) {
  db.prepare("DELETE FROM accountant_groups WHERE accountant_id=? AND group_id=?").run(accountantId, groupId);
}

// ---------- Kế toán: thành viên ----------
export function countMembers(groupId) {
  return db.prepare("SELECT COUNT(*) as cnt FROM members WHERE group_id=?").get(groupId)?.cnt ?? 0;
}
export function listMembers(groupId) {
  return db.prepare("SELECT * FROM members WHERE group_id=? ORDER BY points DESC, display_name COLLATE NOCASE ASC").all(groupId);
}
export function listMembersWithYesterday(groupId) {
  const vnOffsetMs = 7 * 60 * 60 * 1000;
  const todayStartMs = Math.floor((Date.now() + vnOffsetMs) / 86400000) * 86400000 - vnOffsetMs;
  return db.prepare(`
    SELECT m.*,
      ROUND(m.points - COALESCE((
        SELECT SUM(CASE WHEN pt.to_member = m.zalo_uid THEN pt.points ELSE -pt.points END)
        FROM point_transactions pt
        WHERE pt.group_id = m.group_id
          AND (pt.to_member = m.zalo_uid OR pt.from_member = m.zalo_uid)
          AND (pt.status IS NULL OR pt.status NOT IN ('pending','rejected'))
          AND pt.created_at >= ?
      ), 0), 10) AS points_yesterday
    FROM members m
    WHERE m.group_id = ?
    ORDER BY m.points DESC, m.display_name COLLATE NOCASE ASC
  `).all(todayStartMs, groupId);
}
export function getMemberByZaloUid(groupId, zaloUid) {
  return db.prepare("SELECT * FROM members WHERE group_id=? AND zalo_uid=?").get(groupId, zaloUid);
}
export function upsertMember(groupId, zaloUid, { phone, display_name, avatar } = {}) {
  const existing = getMemberByZaloUid(groupId, zaloUid);
  if (existing) {
    db.prepare("UPDATE members SET phone=COALESCE(?,phone), display_name=COALESCE(?,display_name), avatar=COALESCE(?,avatar), updated_at=? WHERE id=?")
      .run(phone || null, display_name || null, avatar || null, now(), existing.id);
    return existing.id;
  }
  const id = uid();
  db.prepare("INSERT INTO members(id,group_id,zalo_uid,phone,display_name,avatar,points,created_at,updated_at) VALUES(?,?,?,?,?,?,0,?,?)")
    .run(id, groupId, zaloUid, phone || null, display_name || null, avatar || null, now(), now());
  return id;
}
export function setMemberAlias(groupId, zaloUid, alias) {
  db.prepare("UPDATE members SET alias=?, updated_at=? WHERE group_id=? AND zalo_uid=?")
    .run(alias || null, now(), groupId, zaloUid);
}
export function deleteRemovedMembers(groupId, activeUids) {
  if (!activeUids.length) return 0; // an toàn: không xóa cả nhóm nếu Zalo trả về rỗng
  const placeholders = activeUids.map(() => "?").join(",");
  return db.prepare(`DELETE FROM members WHERE group_id=? AND zalo_uid NOT IN (${placeholders})`)
    .run(groupId, ...activeUids).changes;
}
// Trả về zalo_uid của kế toán có selfId nhỏ nhất trong nhóm → đó là primary session
// Dùng LENGTH + text sort để đảm bảo đúng thứ tự số nguyên mà không cần CAST (tránh overflow)
export function getPrimaryAccountantSelfIdForGroup(groupId) {
  const row = db.prepare(`
    SELECT zs.zalo_uid FROM accountant_groups ag
    JOIN zalo_sessions zs ON zs.user_id = ag.accountant_id
    WHERE ag.group_id = ? AND zs.zalo_uid IS NOT NULL
    ORDER BY LENGTH(zs.zalo_uid) ASC, zs.zalo_uid ASC LIMIT 1
  `).get(groupId);
  return row?.zalo_uid || null;
}
export function getMembersByDisplayName(groupId, name) {
  return db.prepare("SELECT * FROM members WHERE group_id=? AND display_name=?").all(groupId, name);
}

// ---------- Kế toán: giao dịch điểm ----------
export function adjustPoints(groupId, zaloUid, delta, reason, type = "manual", tripMsgId = null, fromMember = null, toMember = null, rawText = null) {
  const memberId = upsertMember(groupId, zaloUid);
  db.prepare("UPDATE members SET points=ROUND(points+?,10), updated_at=? WHERE group_id=? AND zalo_uid=?")
    .run(delta, now(), groupId, zaloUid);
  // Gán member vào transaction để lịch sử per-member hiện đúng
  if (fromMember === null && toMember === null) {
    if (delta >= 0) toMember = zaloUid;
    else fromMember = zaloUid;
  }
  const txId = uid();
  db.prepare("INSERT INTO point_transactions(id,group_id,trip_msg_id,from_member,to_member,points,reason,type,raw_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(txId, groupId, tripMsgId, fromMember, toMember, Math.abs(delta), reason || null, type, rawText || null, now());
  return txId;
}
export function getTransactionsByTripMsgId(groupId, tripMsgId) {
  return db.prepare(
    "SELECT * FROM point_transactions WHERE group_id=? AND trip_msg_id=? AND type='barem' ORDER BY created_at DESC LIMIT 10"
  ).all(groupId, tripMsgId);
}
export function listTransactions(groupId, { zaloUid, limit = 100 } = {}) {
  const base = `SELECT pt.*, fm.display_name as from_member_name, tm.display_name as to_member_name
    FROM point_transactions pt
    LEFT JOIN members fm ON fm.group_id=pt.group_id AND fm.zalo_uid=pt.from_member
    LEFT JOIN members tm ON tm.group_id=pt.group_id AND tm.zalo_uid=pt.to_member`;
  if (zaloUid) {
    return db.prepare(`${base} WHERE pt.group_id=? AND (pt.from_member=? OR pt.to_member=?) ORDER BY pt.created_at DESC LIMIT ?`)
      .all(groupId, zaloUid, zaloUid, limit);
  }
  return db.prepare(`${base} WHERE pt.group_id=? ORDER BY pt.created_at DESC LIMIT ?`).all(groupId, limit);
}
export function updateTransaction(id, { reason, points }) {
  const tx = db.prepare("SELECT * FROM point_transactions WHERE id=?").get(id);
  if (!tx) throw new Error("Không tìm thấy giao dịch");
  const diff = (points !== undefined ? points : tx.points) - tx.points;
  if (points !== undefined && diff !== 0) {
    if (tx.to_member) db.prepare("UPDATE members SET points=ROUND(points+?,10), updated_at=? WHERE group_id=? AND zalo_uid=?")
      .run(-diff, now(), tx.group_id, tx.to_member);
    if (tx.from_member) db.prepare("UPDATE members SET points=ROUND(points+?,10), updated_at=? WHERE group_id=? AND zalo_uid=?")
      .run(diff, now(), tx.group_id, tx.from_member);
  }
  db.prepare("UPDATE point_transactions SET reason=COALESCE(?,reason), points=COALESCE(?,points) WHERE id=?")
    .run(reason || null, points !== undefined ? points : null, id);
}
export function deleteTransaction(id) {
  const tx = db.prepare("SELECT * FROM point_transactions WHERE id=?").get(id);
  if (!tx) throw new Error("Không tìm thấy giao dịch");
  // Hoàn điểm: đảo ngược giao dịch (to_member nhận → trừ lại; from_member gửi → cộng lại)
  if (tx.to_member) db.prepare("UPDATE members SET points=ROUND(points-?,10), updated_at=? WHERE group_id=? AND zalo_uid=?")
    .run(tx.points, now(), tx.group_id, tx.to_member);
  if (tx.from_member) db.prepare("UPDATE members SET points=ROUND(points+?,10), updated_at=? WHERE group_id=? AND zalo_uid=?")
    .run(tx.points, now(), tx.group_id, tx.from_member);
  db.prepare("DELETE FROM point_transactions WHERE id=?").run(id);
}

// ---------- Kế toán: giao dịch chờ duyệt (san điểm) ----------
export function createPendingTransfer(groupId, fromUid, toUid, points, rawText, msgId = null) {
  // Dedup: nếu msgId đã tồn tại trong nhóm này → bỏ qua (2 Zalo account cùng theo dõi nhóm)
  if (msgId) {
    const exists = db.prepare("SELECT id FROM point_transactions WHERE group_id=? AND trip_msg_id=? AND status='pending'").get(groupId, msgId);
    if (exists) return exists.id;
  }
  const txId = uid();
  db.prepare(`INSERT INTO point_transactions
    (id,group_id,trip_msg_id,from_member,to_member,points,reason,type,status,requester_uid,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(txId, groupId, msgId || null, fromUid, toUid || null, Math.abs(points), rawText || null,
      "manual", "pending", fromUid, now());
  return txId;
}

export function listPendingTransfers(groupId) {
  return db.prepare(`
    SELECT pt.*,
      COALESCE(fm.alias, fm.display_name) as from_member_name, fm.points as from_points,
      COALESCE(tm.alias, tm.display_name) as to_member_name,   tm.points as to_points
    FROM point_transactions pt
    LEFT JOIN members fm ON fm.group_id=pt.group_id AND fm.zalo_uid=pt.from_member
    LEFT JOIN members tm ON tm.group_id=pt.group_id AND tm.zalo_uid=pt.to_member
    WHERE pt.group_id=? AND pt.status='pending' ORDER BY pt.created_at DESC`
  ).all(groupId);
}

export function approvePendingTransfer(txId) {
  const tx = db.prepare("SELECT * FROM point_transactions WHERE id=? AND status='pending'").get(txId);
  if (!tx) throw new Error("Không tìm thấy giao dịch đang chờ");
  if (tx.from_member) {
    upsertMember(tx.group_id, tx.from_member);
    db.prepare("UPDATE members SET points=ROUND(points-?,10),updated_at=? WHERE group_id=? AND zalo_uid=?")
      .run(tx.points, now(), tx.group_id, tx.from_member);
  }
  if (tx.to_member) {
    upsertMember(tx.group_id, tx.to_member);
    db.prepare("UPDATE members SET points=ROUND(points+?,10),updated_at=? WHERE group_id=? AND zalo_uid=?")
      .run(tx.points, now(), tx.group_id, tx.to_member);
  }
  db.prepare("UPDATE point_transactions SET status='approved' WHERE id=?").run(txId);
}

export function rejectPendingTransfer(txId) {
  const tx = db.prepare("SELECT * FROM point_transactions WHERE id=? AND status='pending'").get(txId);
  if (!tx) throw new Error("Không tìm thấy giao dịch đang chờ");
  db.prepare("UPDATE point_transactions SET status='rejected' WHERE id=?").run(txId);
}

// ---------- Kế toán: account KT của nhóm (để auto san điểm) ----------
export function getGroupKtUid(groupId) {
  return getSetting(`kt_uid_${groupId}`, null) || null;
}
export function setGroupKtUid(groupId, uid) {
  return setSetting(`kt_uid_${groupId}`, uid || "");
}

// ---------- Kế toán: barem ----------
export function getRules(groupId) {
  return db.prepare("SELECT * FROM point_rules WHERE group_id=?").get(groupId) || null;
}
export function saveRules(groupId, rulesJson, rawText) {
  db.prepare("INSERT INTO point_rules(group_id,rules_json,raw_text,updated_at) VALUES(?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET rules_json=excluded.rules_json, raw_text=excluded.raw_text, updated_at=excluded.updated_at")
    .run(groupId, rulesJson, rawText || "", now());
}

export default db;
