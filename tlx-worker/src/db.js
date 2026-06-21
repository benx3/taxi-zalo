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
      SELECT date(created_at/1000,'unixepoch','+7 hours') as day,
        status, COUNT(*) as count
      FROM users WHERE role='driver' AND created_at>=? AND created_at<=? AND status=?
      GROUP BY day, status ORDER BY day ASC
    `).all(fromMs, toMs, status);
  }
  return db.prepare(`
    SELECT date(created_at/1000,'unixepoch','+7 hours') as day,
      status, COUNT(*) as count
    FROM users WHERE role='driver' AND created_at>=? AND created_at<=?
    GROUP BY day, status ORDER BY day ASC
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

// ---------- Dọn dữ liệu cũ > 2 tháng ----------
export function purgeOld() {
  const cutoff = now() - 60 * 86400000;
  const r = db.prepare("DELETE FROM saved_trips WHERE taken_at < ?").run(cutoff);
  if (r.changes) console.log(`🧹 Đã xoá ${r.changes} cuốc cũ hơn 2 tháng.`);
}

// ---------- Kế toán: nhóm phụ trách ----------
export function getAccountantGroups(accountantId) {
  return db.prepare("SELECT * FROM accountant_groups WHERE accountant_id=?").all(accountantId);
}
export function addAccountantGroup(accountantId, groupId, groupName) {
  db.prepare("INSERT OR REPLACE INTO accountant_groups(accountant_id,group_id,group_name) VALUES(?,?,?)").run(accountantId, groupId, groupName || groupId);
}
export function removeAccountantGroup(accountantId, groupId) {
  db.prepare("DELETE FROM accountant_groups WHERE accountant_id=? AND group_id=?").run(accountantId, groupId);
}

// ---------- Kế toán: thành viên ----------
export function listMembers(groupId) {
  return db.prepare("SELECT * FROM members WHERE group_id=? ORDER BY points DESC, display_name COLLATE NOCASE ASC").all(groupId);
}
export function getMemberByZaloUid(groupId, zaloUid) {
  return db.prepare("SELECT * FROM members WHERE group_id=? AND zalo_uid=?").get(groupId, zaloUid);
}
export function upsertMember(groupId, zaloUid, { phone, display_name } = {}) {
  const existing = getMemberByZaloUid(groupId, zaloUid);
  if (existing) {
    db.prepare("UPDATE members SET phone=COALESCE(?,phone), display_name=COALESCE(?,display_name), updated_at=? WHERE id=?")
      .run(phone || null, display_name || null, now(), existing.id);
    return existing.id;
  }
  const id = uid();
  db.prepare("INSERT INTO members(id,group_id,zalo_uid,phone,display_name,points,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)")
    .run(id, groupId, zaloUid, phone || null, display_name || null, now(), now());
  return id;
}
export function deleteRemovedMembers(groupId, activeUids) {
  if (!activeUids.length) return 0; // an toàn: không xóa cả nhóm nếu Zalo trả về rỗng
  const placeholders = activeUids.map(() => "?").join(",");
  return db.prepare(`DELETE FROM members WHERE group_id=? AND zalo_uid NOT IN (${placeholders})`)
    .run(groupId, ...activeUids).changes;
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
export function createPendingTransfer(groupId, fromUid, toUid, points, rawText) {
  const txId = uid();
  db.prepare(`INSERT INTO point_transactions
    (id,group_id,from_member,to_member,points,reason,type,status,requester_uid,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(txId, groupId, fromUid, toUid || null, Math.abs(points), rawText || null,
      "manual", "pending", fromUid, now());
  return txId;
}

export function listPendingTransfers(groupId) {
  return db.prepare(`
    SELECT pt.*,
      fm.display_name as from_member_name, fm.points as from_points,
      tm.display_name as to_member_name,   tm.points as to_points
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
