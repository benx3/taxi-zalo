#!/usr/bin/env node
// ============================================================
// purge-old-account.js
// Dọn sạch tài khoản cũ: xóa 0966463502 (Zalo 0934505282)
// Giữ nguyên tài khoản 0853132353 và toàn bộ dữ liệu của họ.
//
// Cách chạy (trong thư mục tlx-worker):
//   DRY_RUN=1 node scripts/purge-old-account.js   ← xem trước
//   node scripts/purge-old-account.js              ← thực thi
// ============================================================
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const DRY_RUN  = process.env.DRY_RUN === "1";

const DELETE_PHONE = "0966463502"; // tài khoản cần xóa
const KEEP_PHONE   = "0853132353"; // tài khoản giữ lại

if (!fs.existsSync(path.join(DATA_DIR, "tlx.db"))) {
  console.error(`❌ Không tìm thấy DB: ${DATA_DIR}/tlx.db`);
  process.exit(1);
}

const db = new Database(path.join(DATA_DIR, "tlx.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

if (DRY_RUN) console.log("🔍 DRY RUN — không ghi DB\n");
else         console.log("⚡ LIVE MODE — sẽ ghi DB thật\n");

// ---- 1. Tìm 2 user ----
const delUser  = db.prepare("SELECT * FROM users WHERE phone = ?").get(DELETE_PHONE);
const keepUser = db.prepare("SELECT * FROM users WHERE phone = ?").get(KEEP_PHONE);

if (!delUser)  { console.error(`❌ Không tìm thấy user: ${DELETE_PHONE}`);  process.exit(1); }
if (!keepUser) { console.error(`❌ Không tìm thấy user: ${KEEP_PHONE}`);    process.exit(1); }

console.log(`Tài khoản XÓA : phone=${delUser.phone}  id=${delUser.id}  name="${delUser.name}"  status=${delUser.status}`);
console.log(`Tài khoản GIỮ : phone=${keepUser.phone} id=${keepUser.id} name="${keepUser.name}" status=${keepUser.status}\n`);

// ---- 2. Nhóm của từng user ----
const delGroups  = db.prepare("SELECT * FROM accountant_groups WHERE accountant_id = ?").all(delUser.id);
const keepGroups = db.prepare("SELECT * FROM accountant_groups WHERE accountant_id = ?").all(keepUser.id);

const keepGroupSet = new Set(keepGroups.map(g => g.group_id));

console.log(`Nhóm của ${DELETE_PHONE} (${delGroups.length}):`);
delGroups.forEach(g => console.log(`  ${g.group_id}  "${g.group_name || ""}"`));

console.log(`\nNhóm của ${KEEP_PHONE} (${keepGroups.length}):`);
keepGroups.forEach(g => console.log(`  ${g.group_id}  "${g.group_name || ""}"`));

// ---- 3. Nhóm chỉ có DELETE user → chuyển sang KEEP user ----
const onlyDel = delGroups.filter(g => !keepGroupSet.has(g.group_id));
if (onlyDel.length > 0) {
  console.log(`\n⚠️  Nhóm chỉ có ${DELETE_PHONE}, sẽ chuyển sang ${KEEP_PHONE}:`);
  for (const g of onlyDel) {
    console.log(`  → "${g.group_name || g.group_id}"`);
    if (!DRY_RUN) {
      db.prepare(`
        INSERT OR IGNORE INTO accountant_groups (accountant_id, group_id, group_name)
        VALUES (?, ?, ?)
      `).run(keepUser.id, g.group_id, g.group_name);
    }
  }
} else {
  console.log(`\n✅ Tất cả nhóm của ${DELETE_PHONE} đều đã có trong ${KEEP_PHONE} — không cần chuyển.`);
}

// ---- 4. Xóa accountant_groups của DELETE user ----
console.log(`\n🗑️  Xóa accountant_groups của ${DELETE_PHONE}...`);
if (!DRY_RUN) {
  const r = db.prepare("DELETE FROM accountant_groups WHERE accountant_id = ?").run(delUser.id);
  console.log(`   Đã xóa ${r.changes} nhóm`);
} else {
  console.log(`   [DRY] Sẽ xóa ${delGroups.length} nhóm`);
}

// ---- 5. Xóa zalo_sessions của DELETE user ----
const sess = db.prepare("SELECT * FROM zalo_sessions WHERE user_id = ?").all(delUser.id);
console.log(`\n🗑️  Zalo sessions của ${DELETE_PHONE}: ${sess.length} bản`);
if (sess.length > 0) {
  sess.forEach(s => console.log(`   zalo_uid=${s.zalo_uid || "(chưa quét QR)"}`));
}
if (!DRY_RUN) {
  const r = db.prepare("DELETE FROM zalo_sessions WHERE user_id = ?").run(delUser.id);
  console.log(`   Đã xóa ${r.changes} session`);
} else {
  console.log(`   [DRY] Sẽ xóa ${sess.length} session`);
}

// ---- 6. Dedup transactions trip_msg_id cho tất cả nhóm liên quan ----
const allGroupIds = new Set([...delGroups.map(g => g.group_id), ...keepGroups.map(g => g.group_id)]);
console.log(`\n🔍 Kiểm tra transaction trùng trip_msg_id (${allGroupIds.size} nhóm)...`);
let totalTxDedup = 0;

for (const gid of allGroupIds) {
  const dups = db.prepare(`
    SELECT trip_msg_id, COUNT(*) as cnt
    FROM point_transactions
    WHERE group_id = ? AND trip_msg_id IS NOT NULL AND trip_msg_id != ''
    GROUP BY trip_msg_id
    HAVING COUNT(*) > 1
  `).all(gid);

  for (const dup of dups) {
    const keepRow = db.prepare(`
      SELECT id FROM point_transactions
      WHERE group_id = ? AND trip_msg_id = ?
      ORDER BY created_at ASC LIMIT 1
    `).get(gid, dup.trip_msg_id);
    if (!keepRow) continue;
    if (!DRY_RUN) {
      const r = db.prepare(`
        DELETE FROM point_transactions
        WHERE group_id = ? AND trip_msg_id = ? AND id != ?
      `).run(gid, dup.trip_msg_id, keepRow.id);
      if (r.changes) console.log(`  [${gid}] msg=${dup.trip_msg_id}: xóa ${r.changes} tx trùng`);
      totalTxDedup += r.changes;
    } else {
      console.log(`  [${gid}] [DRY] msg=${dup.trip_msg_id}: ${dup.cnt} bản → xóa ${dup.cnt - 1}`);
      totalTxDedup += dup.cnt - 1;
    }
  }
}
if (totalTxDedup === 0) console.log("  ✅ Không có transaction trùng.");

// ---- 7. Tính lại điểm sau dedup ----
if (!DRY_RUN && allGroupIds.size > 0) {
  console.log(`\n♻️  Tính lại điểm cho ${allGroupIds.size} nhóm...`);
  const now = Date.now();
  for (const gid of allGroupIds) {
    const mems = db.prepare("SELECT id, zalo_uid FROM members WHERE group_id = ?").all(gid);
    for (const m of mems) {
      const res = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN to_member   = ? THEN  points
               WHEN from_member = ? THEN -points
               ELSE 0 END
        ), 0) AS total
        FROM point_transactions
        WHERE group_id = ? AND (to_member = ? OR from_member = ?)
          AND (status IS NULL OR status NOT IN ('pending','rejected'))
      `).get(m.zalo_uid, m.zalo_uid, gid, m.zalo_uid, m.zalo_uid);
      const newPts = Math.round((res.total || 0) * 1e10) / 1e10;
      db.prepare("UPDATE members SET points = ?, updated_at = ? WHERE id = ?").run(newPts, now, m.id);
    }
    console.log(`  [${gid}] Tính lại ${mems.length} thành viên`);
  }
}

// ---- 8. Ban tài khoản DELETE (không xóa hẳn để giữ lịch sử) ----
console.log(`\n🚫 Ban tài khoản ${DELETE_PHONE}...`);
if (!DRY_RUN) {
  db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(delUser.id);
  console.log(`   Đã ban user id=${delUser.id}`);
} else {
  console.log(`   [DRY] Sẽ set status='banned' cho user id=${delUser.id}`);
}

// ---- Tổng kết ----
console.log("\n" + "=".repeat(55));
if (DRY_RUN) {
  console.log("🔍 DRY RUN xong. Chạy lại KHÔNG có DRY_RUN=1 để áp dụng.");
} else {
  console.log(`✅ Xong!`);
  console.log(`   Tài khoản ${DELETE_PHONE} đã bị ban và xóa khỏi tất cả nhóm`);
  console.log(`   ${onlyDel.length} nhóm exclusive đã chuyển sang ${KEEP_PHONE}`);
  console.log(`   ${totalTxDedup} transaction trùng (same trip_msg_id) đã xóa`);
}
