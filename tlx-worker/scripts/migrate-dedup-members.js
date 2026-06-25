#!/usr/bin/env node
// ============================================================
// migrate-dedup-members.js
// Gộp thành viên trùng TRONG CÙNG NHÓM:
//   • Trùng zalo_uid     → chắc chắn cùng người
//   • Trùng display_name → khả năng cao cùng người (cùng nhóm)
//
// Khác nhóm: tên giống nhau là bình thường, KHÔNG gộp.
//
// Cách chạy (trong thư mục tlx-worker):
//   DRY_RUN=1 node scripts/migrate-dedup-members.js   ← xem trước
//   node scripts/migrate-dedup-members.js              ← thực thi
// ============================================================
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const DRY_RUN   = process.env.DRY_RUN === "1";

if (!fs.existsSync(path.join(DATA_DIR, "tlx.db"))) {
  console.error(`❌ Không tìm thấy DB: ${DATA_DIR}/tlx.db`);
  process.exit(1);
}

const db = new Database(path.join(DATA_DIR, "tlx.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF");

if (DRY_RUN) console.log("🔍 DRY RUN — không ghi DB\n");
else         console.log("⚡ LIVE MODE — sẽ ghi DB thật\n");

// ============================================================
// Helper: gộp 2 member (canonical ← duplicate)
// ============================================================
function merge(canonical, dup, groupId, reason) {
  if (!DRY_RUN) {
    // Chuyển from_member
    db.prepare(`UPDATE point_transactions SET from_member=? WHERE group_id=? AND from_member=?`)
      .run(canonical.zalo_uid, groupId, dup.zalo_uid);
    // Chuyển to_member
    db.prepare(`UPDATE point_transactions SET to_member=? WHERE group_id=? AND to_member=?`)
      .run(canonical.zalo_uid, groupId, dup.zalo_uid);
    // pending_transfers nếu có
    try {
      db.prepare(`UPDATE pending_transfers SET from_uid=? WHERE group_id=? AND from_uid=?`)
        .run(canonical.zalo_uid, groupId, dup.zalo_uid);
      db.prepare(`UPDATE pending_transfers SET to_uid=? WHERE group_id=? AND to_uid=?`)
        .run(canonical.zalo_uid, groupId, dup.zalo_uid);
    } catch {}
    // Xóa bản trùng
    db.prepare(`DELETE FROM members WHERE id=?`).run(dup.id);
  }
  console.log(`    [${reason}] MERGE: uid_cũ=${dup.zalo_uid} pts=${dup.points}`
    + `  →  uid_mới=${canonical.zalo_uid} pts=${canonical.points}`
    + (DRY_RUN ? "  [DRY]" : "  ✓"));
}

// ============================================================
// Lấy danh sách tất cả nhóm có member
// ============================================================
const groups = db.prepare(`SELECT DISTINCT group_id FROM members ORDER BY group_id`).all();
console.log(`Tổng số nhóm: ${groups.length}\n${"=".repeat(60)}`);

let totalMergedUid  = 0;
let totalMergedName = 0;
let totalTxDedup    = 0;
const affectedGroups = new Set();

for (const { group_id } of groups) {

  // ---- A. Trùng zalo_uid trong cùng nhóm ----
  const uidDupes = db.prepare(`
    SELECT zalo_uid, COUNT(*) as cnt
    FROM members
    WHERE group_id = ?
    GROUP BY zalo_uid
    HAVING COUNT(*) > 1
  `).all(group_id);

  // ---- B. Trùng display_name (chuẩn hóa) trong cùng nhóm ----
  const nameDupes = db.prepare(`
    SELECT TRIM(LOWER(display_name)) as norm_name, COUNT(*) as cnt
    FROM members
    WHERE group_id = ? AND display_name IS NOT NULL AND display_name != ''
    GROUP BY TRIM(LOWER(display_name))
    HAVING COUNT(*) > 1
  `).all(group_id);

  if (uidDupes.length === 0 && nameDupes.length === 0) continue;

  console.log(`\nNhóm: ${group_id}`);

  // ---- A. Xử lý trùng zalo_uid ----
  for (const { zalo_uid } of uidDupes) {
    const rows = db.prepare(`
      SELECT * FROM members
      WHERE group_id = ? AND zalo_uid = ?
      ORDER BY created_at DESC
    `).all(group_id, zalo_uid);

    console.log(`  [UID] trùng uid=${zalo_uid} (${rows.length} bản)`);
    const canonical = rows[0]; // mới nhất
    for (const dup of rows.slice(1)) {
      merge(canonical, dup, group_id, "UID");
      totalMergedUid++;
      affectedGroups.add(group_id);
    }
  }

  // ---- B. Xử lý trùng display_name ----
  for (const { norm_name } of nameDupes) {
    // Lấy lại từ DB (sau khi đã xóa dup UID ở trên)
    const rows = db.prepare(`
      SELECT * FROM members
      WHERE group_id = ? AND TRIM(LOWER(display_name)) = ?
      ORDER BY created_at DESC
    `).all(group_id, norm_name);

    if (rows.length < 2) continue; // đã được xử lý ở bước UID

    console.log(`  [TÊN] "${rows[0].display_name}" — ${rows.length} bản`
      + ` uid: ${rows.map(r => r.zalo_uid).join(", ")}`);
    const canonical = rows[0]; // mới nhất
    for (const dup of rows.slice(1)) {
      merge(canonical, dup, group_id, "TÊN");
      totalMergedName++;
      affectedGroups.add(group_id);
    }
  }
}

// ============================================================
// Dedup transaction trùng trip_msg_id trong từng nhóm
// ============================================================
// Kiểm tra tất cả nhóm (không chỉ nhóm có member trùng)
const allGroupIds = groups.map(g => g.group_id);
console.log(`\n${"=".repeat(60)}`);
console.log(`🔍 Kiểm tra transaction trùng trip_msg_id (${allGroupIds.length} nhóm)...`);

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
      if (r.changes) {
        console.log(`  [${gid}] msg=${dup.trip_msg_id}: xóa ${r.changes} tx trùng`);
        totalTxDedup += r.changes;
        affectedGroups.add(gid);
      }
    } else {
      console.log(`  [${gid}] [DRY] msg=${dup.trip_msg_id}: ${dup.cnt} bản → xóa ${dup.cnt - 1}`);
      totalTxDedup += dup.cnt - 1;
    }
  }
}
if (totalTxDedup === 0) console.log("  ✅ Không có transaction trùng.");

// ============================================================
// Tính lại điểm cho nhóm bị ảnh hưởng
// ============================================================
if (!DRY_RUN && affectedGroups.size > 0) {
  console.log(`\n♻️  Tính lại điểm cho ${affectedGroups.size} nhóm bị ảnh hưởng...`);
  const now = Date.now();
  for (const gid of affectedGroups) {
    const mems = db.prepare(`SELECT id, zalo_uid FROM members WHERE group_id = ?`).all(gid);
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
      db.prepare(`UPDATE members SET points = ?, updated_at = ? WHERE id = ?`)
        .run(newPts, now, m.id);
    }
    console.log(`  [${gid}] Tính lại ${mems.length} thành viên`);
  }
}

// ============================================================
// Tổng kết
// ============================================================
console.log("\n" + "=".repeat(60));
if (totalMergedUid === 0 && totalMergedName === 0 && totalTxDedup === 0) {
  console.log("✅ Không có dữ liệu trùng trong bất kỳ nhóm nào.");
} else if (DRY_RUN) {
  console.log(`🔍 DRY RUN xong:`);
  console.log(`   ${totalMergedUid}  member trùng zalo_uid sẽ bị gộp`);
  console.log(`   ${totalMergedName} member trùng tên sẽ bị gộp`);
  console.log(`   ${totalTxDedup}  transaction trùng trip_msg_id sẽ bị xóa`);
  console.log(`   Chạy lại KHÔNG có DRY_RUN=1 để áp dụng thật.`);
} else {
  console.log(`✅ Migration xong:`);
  console.log(`   ${totalMergedUid}  member trùng zalo_uid đã gộp`);
  console.log(`   ${totalMergedName} member trùng tên đã gộp`);
  console.log(`   ${totalTxDedup}  transaction trùng trip_msg_id đã xóa`);
  console.log(`   Điểm đã tính lại từ lịch sử giao dịch.`);
}
