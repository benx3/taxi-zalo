// ============================================================
// dbLayer.js — chọn lớp DB theo môi trường.
//   - Có DATABASE_URL  → PostgreSQL (db.pg.js)  [production VPS]
//   - Không            → SQLite (db.js)         [dev local]
// Cả hai expose cùng tên hàm. Code khác chỉ cần `await` mọi lời gọi.
// SQLite vốn đồng bộ; ở đây ta vẫn await được vì await trên giá trị
// thường trả về chính giá trị đó (không lỗi).
// ============================================================

// Nếu DATABASE_URL chưa có trong env (ví dụ: tlx-driver-service chạy với .env riêng
// không có DATABASE_URL), thử đọc từ tlx-worker/.env để dùng chung DB.
// Điều này đảm bảo driver-service và worker luôn trỏ cùng một database.
if (!process.env.DATABASE_URL) {
  try {
    const { readFileSync } = await import("fs");
    const { resolve, dirname } = await import("path");
    const { fileURLToPath } = await import("url");
    const workerEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
    const content = readFileSync(workerEnvPath, "utf8");
    const dbMatch = content.match(/^DATABASE_URL=(.+)$/m);
    const url = dbMatch?.[1]?.trim();
    if (url) {
      process.env.DATABASE_URL = url;
      console.log("🔗 DATABASE_URL tự động lấy từ tlx-worker/.env");
    }
    // APP_SECRET cũng cần giống nhau để giải mã session Zalo
    if (!process.env.APP_SECRET) {
      const secMatch = content.match(/^APP_SECRET=(.+)$/m);
      const sec = secMatch?.[1]?.trim();
      if (sec) process.env.APP_SECRET = sec;
    }
  } catch { /* không có file .env hoặc không đọc được — dùng SQLite */ }
}

let impl;
if (process.env.DATABASE_URL) {
  impl = await import("./db.pg.js");
  if (impl.initDb) await impl.initDb();
  console.log("🗄️  Dùng PostgreSQL");
} else {
  impl = await import("./db.js");
  console.log("🗄️  Dùng SQLite (dev). Đặt DATABASE_URL để chuyển PostgreSQL.");
}

export const {
  ensureSeed, register, login, userIdFromToken, logout, getUserPublic,
  listUsers, listUsersWithZalo, approveUser, renewUser, toggleBan, changePassword, setRole,
  resetPassword, getRevenueStats, getUserStats,
  saveZaloSession, getZaloSession, clearZaloSession,
  saveTrip, markTripWon, deleteSavedTrip, listSavedTrips, purgeOld,
  getSetting, setSetting,
  getAccountantGroups, addAccountantGroup, removeAccountantGroup,
  listMembers, getMemberByZaloUid, upsertMember, deleteRemovedMembers,
  adjustPoints, listTransactions, updateTransaction, deleteTransaction,
  createPendingTransfer, listPendingTransfers, approvePendingTransfer, rejectPendingTransfer,
  lockAccountantGroups, isGroupsLocked,
  getRules, saveRules,
  getGroupKtUid, setGroupKtUid,
} = impl;
