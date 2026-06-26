/**
 * Xóa thành viên TẠM (~imp_*) đã có thành viên thật cùng tên trong cùng nhóm.
 *
 * Chạy từ thư mục tlx-worker:
 *   node clean-temp-members.js --dry-run   ← chỉ xem, chưa xóa
 *   node clean-temp-members.js             ← xóa thật
 *
 * Trên VPS:
 *   cd /opt/tlx/tlx-worker
 *   node clean-temp-members.js --dry-run
 */

import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "data/tlx.db");
const DRY_RUN = process.argv.includes("--dry-run");

const db = new Database(DB_PATH, { readonly: DRY_RUN });

const dupes = db.prepare(`
  SELECT
    tmp.group_id,
    tmp.zalo_uid  AS tmp_uid,
    tmp.display_name,
    real.zalo_uid AS real_uid
  FROM members tmp
  JOIN members real
    ON real.group_id     = tmp.group_id
   AND real.display_name = tmp.display_name
   AND real.zalo_uid NOT LIKE '~imp_%'
  WHERE tmp.zalo_uid LIKE '~imp_%'
  ORDER BY tmp.group_id, tmp.display_name
`).all();

if (dupes.length === 0) {
  console.log("✅ Không có thành viên tạm nào trùng tên với thành viên thật.");
  db.close();
  process.exit(0);
}

console.log(`Tìm thấy ${dupes.length} thành viên tạm${DRY_RUN ? " (DRY RUN — chưa xóa)" : " — đang xóa..."}:\n`);
for (const row of dupes) {
  console.log(`  Nhóm ${row.group_id} | "${row.display_name}" | tạm: ${row.tmp_uid} → thật: ${row.real_uid}`);
}

if (!DRY_RUN) {
  const del = db.prepare("DELETE FROM members WHERE group_id=? AND zalo_uid=?");
  const deleteAll = db.transaction(() => {
    for (const row of dupes) del.run(row.group_id, row.tmp_uid);
  });
  deleteAll();
  console.log(`\n✅ Đã xóa ${dupes.length} thành viên tạm.`);
} else {
  console.log(`\n→ Chạy lại không có --dry-run để xóa thật.`);
}

db.close();
