// ============================================================
// dbLayer.js — chọn lớp DB theo môi trường.
//   - Có DATABASE_URL  → PostgreSQL (db.pg.js)  [production VPS]
//   - Không            → SQLite (db.js)         [dev local]
// Cả hai expose cùng tên hàm. Code khác chỉ cần `await` mọi lời gọi.
// SQLite vốn đồng bộ; ở đây ta vẫn await được vì await trên giá trị
// thường trả về chính giá trị đó (không lỗi).
// ============================================================
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
  listUsers, approveUser, renewUser, toggleBan, changePassword, setRole,
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
} = impl;
