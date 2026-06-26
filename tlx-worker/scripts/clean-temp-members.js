/**
 * Xóa thành viên TẠM (zalo_uid LIKE '%imp_%') đã có thành viên thật
 * cùng tên (TRIM) trong cùng nhóm.
 *
 * Tự nhận SQLite hay PostgreSQL qua biến môi trường DATABASE_URL.
 *
 * Chạy từ thư mục tlx-worker:
 *   node scripts/clean-temp-members.js --dry-run   ← chỉ xem, chưa xóa
 *   node scripts/clean-temp-members.js             ← xóa thật
 */

import path from "path";
import { config } from "dotenv";

config(); // load .env trong tlx-worker/

const DRY_RUN = process.argv.includes("--dry-run");
const USE_PG  = !!process.env.DATABASE_URL;

const SQL_FIND = `
  SELECT
    tmp.group_id,
    tmp.zalo_uid  AS tmp_uid,
    tmp.display_name,
    real.zalo_uid AS real_uid
  FROM members tmp
  JOIN members real
    ON real.group_id     = tmp.group_id
   AND TRIM(real.display_name) = TRIM(tmp.display_name)
   AND real.zalo_uid NOT LIKE '%imp_%'
  WHERE tmp.zalo_uid LIKE '%imp_%'
  ORDER BY tmp.group_id, tmp.display_name
`;

// ── PostgreSQL ────────────────────────────────────────────────
async function runPg() {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: dupes } = await pool.query(SQL_FIND);
  printDupes(dupes);

  if (!DRY_RUN && dupes.length > 0) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of dupes)
        await client.query("DELETE FROM members WHERE group_id=$1 AND zalo_uid=$2", [row.group_id, row.tmp_uid]);
      await client.query("COMMIT");
      console.log(`\n✅ Đã xóa ${dupes.length} thành viên tạm.`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

// ── SQLite ────────────────────────────────────────────────────
async function runSqlite() {
  const { default: Database } = await import("better-sqlite3");
  const DB_PATH = path.resolve(process.cwd(), "data/tlx.db");
  const db = new Database(DB_PATH, { readonly: DRY_RUN });

  const dupes = db.prepare(SQL_FIND).all();
  printDupes(dupes);

  if (!DRY_RUN && dupes.length > 0) {
    const del = db.prepare("DELETE FROM members WHERE group_id=? AND zalo_uid=?");
    db.transaction(() => { for (const row of dupes) del.run(row.group_id, row.tmp_uid); })();
    console.log(`\n✅ Đã xóa ${dupes.length} thành viên tạm.`);
  }

  db.close();
}

// ── Hiển thị kết quả ─────────────────────────────────────────
function printDupes(dupes) {
  if (dupes.length === 0) {
    console.log("✅ Không có thành viên tạm nào trùng tên với thành viên thật.");
    return;
  }
  console.log(`Tìm thấy ${dupes.length} thành viên tạm${DRY_RUN ? " (DRY RUN — chưa xóa)" : " — đang xóa..."}:\n`);
  for (const row of dupes)
    console.log(`  Nhóm ${row.group_id} | "${row.display_name}" | tạm: ${row.tmp_uid} → thật: ${row.real_uid}`);
  if (DRY_RUN) console.log(`\n→ Chạy lại không có --dry-run để xóa thật.`);
}

// ── Main ──────────────────────────────────────────────────────
console.log(`DB: ${USE_PG ? "PostgreSQL" : "SQLite"} | Mode: ${DRY_RUN ? "DRY RUN" : "XÓA THẬT"}\n`);
(USE_PG ? runPg() : runSqlite()).catch(e => { console.error(e); process.exit(1); });
