#!/usr/bin/env node
// ============================================================
// migrate-dedup-members.js
// Gộp thành viên bị trùng do 2 Zalo session trả về UID khác nhau
// cho cùng 1 người thật.
//
// Cách chạy (trong thư mục tlx-worker):
//   node scripts/migrate-dedup-members.js
// Hoặc xem trước (dry run, không ghi DB):
//   DRY_RUN=1 node scripts/migrate-dedup-members.js
// ============================================================
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const DRY_RUN = process.env.DRY_RUN === "1";

if (!fs.existsSync(path.join(DATA_DIR, "tlx.db"))) {
  console.error(`❌ Không tìm thấy DB tại ${DATA_DIR}/tlx.db`);
  process.exit(1);
}

const db = new Database(path.join(DATA_DIR, "tlx.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF"); // tạm tắt để update tự do

if (DRY_RUN) console.log("🔍 DRY RUN — không ghi DB\n");
else console.log("⚡ LIVE MODE — sẽ ghi DB thật\n");

// ---- 1. Tìm tất cả nhóm (group_id, display_name) có > 1 thành viên cùng tên ----
const dupes = db.prepare(`
  SELECT group_id, display_name, COUNT(*) as cnt
  FROM members
  WHERE display_name IS NOT NULL AND display_name != ''
  GROUP BY group_id, display_name
  HAVING COUNT(*) > 1
  ORDER BY group_id, display_name
`).all();

if (dupes.length === 0) {
  console.log("✅ Không có thành viên trùng tên. Không cần migrate.");
  process.exit(0);
}

console.log(`Tìm thấy ${dupes.length} cặp tên trùng trong DB:\n`);

let totalMerged = 0;
const affectedGroups = new Set();

for (const dupe of dupes) {
  // Lấy tất cả thành viên cùng tên, sắp xếp created_at ASC
  // → người được tạo sớm nhất là từ primary session → làm canonical
  const members = db.prepare(`
    SELECT * FROM members
    WHERE group_id = ? AND display_name = ?
    ORDER BY created_at ASC
  `).all(dupe.group_id, dupe.display_name);

  const canonical = members[0];
  const duplicates = members.slice(1);

  console.log(`[${dupe.group_id}] "${dupe.display_name}" (${members.length} bản):`);
  console.log(`  canonical → zalo_uid=${canonical.zalo_uid} points=${canonical.points} id=${canonical.id}`);

  for (const dup of duplicates) {
    console.log(`  duplicate → zalo_uid=${dup.zalo_uid} points=${dup.points} id=${dup.id}`);

    if (!DRY_RUN) {
      // Chuyển tất cả giao dịch từ UID dup → UID canonical
      const r1 = db.prepare(
        "UPDATE point_transactions SET from_member=? WHERE group_id=? AND from_member=?"
      ).run(canonical.zalo_uid, dupe.group_id, dup.zalo_uid);

      const r2 = db.prepare(
        "UPDATE point_transactions SET to_member=? WHERE group_id=? AND to_member=?"
      ).run(canonical.zalo_uid, dupe.group_id, dup.zalo_uid);

      // Chuyển pending_transfers nếu có
      try {
        db.prepare(
          "UPDATE pending_transfers SET from_uid=? WHERE group_id=? AND from_uid=?"
        ).run(canonical.zalo_uid, dupe.group_id, dup.zalo_uid);
        db.prepare(
          "UPDATE pending_transfers SET to_uid=? WHERE group_id=? AND to_uid=?"
        ).run(canonical.zalo_uid, dupe.group_id, dup.zalo_uid);
      } catch {}

      // Xóa thành viên trùng
      db.prepare("DELETE FROM members WHERE id=?").run(dup.id);

      console.log(`    → Đã merge: txFrom=${r1.changes} txTo=${r2.changes} tx chuyển sang canonical`);
    } else {
      const txFrom = db.prepare(
        "SELECT COUNT(*) as c FROM point_transactions WHERE group_id=? AND from_member=?"
      ).get(dupe.group_id, dup.zalo_uid)?.c || 0;
      const txTo = db.prepare(
        "SELECT COUNT(*) as c FROM point_transactions WHERE group_id=? AND to_member=?"
      ).get(dupe.group_id, dup.zalo_uid)?.c || 0;
      console.log(`    → [DRY] sẽ chuyển ${txFrom} txFrom + ${txTo} txTo → delete member`);
    }

    totalMerged++;
    affectedGroups.add(dupe.group_id);
  }
}

// ---- 2. Tính lại điểm từ giao dịch (sau merge, points column có thể cộng dồn sai) ----
if (!DRY_RUN && affectedGroups.size > 0) {
  console.log(`\n♻️  Tính lại điểm cho ${affectedGroups.size} nhóm bị ảnh hưởng...`);

  const now = Date.now();
  for (const groupId of affectedGroups) {
    const members = db.prepare("SELECT * FROM members WHERE group_id=?").all(groupId);
    let recalcCount = 0;
    for (const m of members) {
      const result = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN to_member   = ? THEN  points
               WHEN from_member = ? THEN -points
               ELSE 0 END
        ), 0) AS total
        FROM point_transactions
        WHERE group_id = ?
          AND (to_member = ? OR from_member = ?)
          AND (status IS NULL OR status NOT IN ('pending', 'rejected'))
      `).get(m.zalo_uid, m.zalo_uid, groupId, m.zalo_uid, m.zalo_uid);

      const newPoints = Math.round((result.total || 0) * 1e10) / 1e10;
      db.prepare("UPDATE members SET points=?, updated_at=? WHERE id=?")
        .run(newPoints, now, m.id);
      recalcCount++;
    }
    console.log(`  [${groupId}] Tính lại ${recalcCount} thành viên`);
  }
}

// ---- Tổng kết ----
console.log("\n" + "=".repeat(50));
if (DRY_RUN) {
  console.log(`🔍 DRY RUN xong: ${totalMerged} thành viên sẽ bị merge trong ${affectedGroups.size} nhóm`);
  console.log(`   Chạy lại KHÔNG có DRY_RUN=1 để áp dụng thật.`);
} else {
  console.log(`✅ Migration xong: đã merge ${totalMerged} thành viên trùng trong ${affectedGroups.size} nhóm`);
  console.log(`   Điểm đã được tính lại từ lịch sử giao dịch.`);
}
