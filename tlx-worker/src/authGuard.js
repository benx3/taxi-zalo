// ============================================================
// authGuard.js — chặn dò mật khẩu + chặn tài khoản bị khóa. Dùng chung tlx-worker & tlx-driver-service.
// Bộ đếm nằm trong RAM từng service (mỗi service tự chặn phần của mình) — đủ cho quy mô hiện tại.
// ============================================================
import * as dbm from "./dbLayer.js";

// ---------- Giới hạn đăng nhập sai ----------
const WINDOW_MS = 15 * 60_000;     // cửa sổ đếm
const LOCK_MS = 15 * 60_000;       // khóa bao lâu khi vượt ngưỡng
const MAX_FAIL_PER_PHONE = 5;      // 1 tài khoản: 5 lần sai / 15 phút
const MAX_FAIL_PER_IP = 20;        // 1 IP: 20 lần sai / 15 phút (dò nhiều tài khoản)
const _fails = new Map();          // key -> { n, first, lockUntil }

function _get(key) {
  const now = Date.now();
  let r = _fails.get(key);
  if (r && !r.lockUntil && now - r.first > WINDOW_MS) { _fails.delete(key); r = null; }
  if (r && r.lockUntil && now > r.lockUntil) { _fails.delete(key); r = null; }
  return r;
}
// ip = null khi không biết IP thật → chỉ đếm theo tài khoản (tránh mọi người chung 1 bộ đếm rồi bị khóa lây)
const keysOf = (ip, phone) => [...(ip ? [`ip:${ip}`] : []), ...(phone ? [`ph:${String(phone).trim().toLowerCase()}`] : [])];

// IP thật của người dùng. Nginx (cùng máy) chuyển tiếp từ 127.0.0.1 và gửi X-Real-IP.
// Chỉ tin X-Real-IP khi request đến từ loopback — gọi thẳng cổng từ Internet thì không giả được.
const isLoopback = (a) => /^(::1|127\.|::ffff:127\.)/.test(String(a || ""));
export function clientIp(req) {
  const remote = req.socket?.remoteAddress || "";
  if (!isLoopback(remote)) return remote;
  const real = String(req.headers["x-real-ip"] || "").trim();
  return real && !isLoopback(real) ? real : null;
}

// Còn bị khóa bao lâu (ms), 0 = được thử
export function loginBlockedFor(ip, phone) {
  let wait = 0;
  for (const k of keysOf(ip, phone)) {
    const r = _get(k);
    if (r?.lockUntil) wait = Math.max(wait, r.lockUntil - Date.now());
  }
  return wait;
}
export function loginFailed(ip, phone) {
  const now = Date.now();
  for (const k of keysOf(ip, phone)) {
    const r = _get(k) || { n: 0, first: now, lockUntil: 0 };
    r.n++;
    const max = k.startsWith("ip:") ? MAX_FAIL_PER_IP : MAX_FAIL_PER_PHONE;
    if (r.n >= max) {
      r.lockUntil = now + LOCK_MS;
      console.warn(`[BẢO MẬT] khóa đăng nhập 15 phút: ${k} (sai ${r.n} lần)`);
    }
    _fails.set(k, r);
  }
}
export function loginSucceeded(ip, phone) {
  if (phone) _fails.delete(`ph:${String(phone).trim().toLowerCase()}`);
}
// Dọn bộ đếm cũ mỗi 10 phút
setInterval(() => { for (const k of [..._fails.keys()]) _get(k); }, 600_000).unref?.();

// Route đăng nhập dùng chung: chặn khi bị khóa, đếm lần sai
export function loginHandler() {
  return async (req, res) => {
    const ip = clientIp(req);
    const phone = typeof req.body?.phone === "string" ? req.body.phone : "";
    const wait = loginBlockedFor(ip, phone);
    if (wait > 0)
      return res.status(429).json({ error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60000)} phút.` });
    if (!phone || typeof req.body?.pass !== "string")
      return res.status(400).json({ error: "Thiếu số điện thoại hoặc mật khẩu" });
    try {
      const r = await dbm.login({ phone, pass: req.body.pass });
      loginSucceeded(ip, phone);
      res.json(r);
    } catch (e) {
      if (/Sai tài khoản/.test(e.message)) loginFailed(ip, phone);
      res.status(400).json({ error: e.message });
    }
  };
}

// Đăng ký: tối đa 10 lần / giờ / IP (chống tạo tài khoản rác hàng loạt)
const _reg = new Map();   // ip -> [mốc thời gian]
export function registerAllowed(ip) {
  if (!ip) return true;   // không biết IP thật → không chặn (tránh chặn lây mọi người)
  const now = Date.now();
  const arr = (_reg.get(ip) || []).filter(t => now - t < 3600_000);
  if (arr.length >= 10) { _reg.set(ip, arr); return false; }
  arr.push(now); _reg.set(ip, arr);
  return true;
}

// ---------- Tài khoản bị khóa ----------
// Token cũ của người bị khóa phải hết tác dụng ngay ở MỌI service (token nằm RAM từng service,
// khóa ở service này thì service kia không biết) → kiểm tra trạng thái theo DB, cache 60s.
const _status = new Map();   // userId -> { banned, at }
async function isBanned(userId) {
  const c = _status.get(userId);
  if (c && Date.now() - c.at < 60_000) return c.banned;
  const u = await dbm.getUserPublic(userId).catch(() => null);
  const banned = !u || u.status === "banned";
  _status.set(userId, { banned, at: Date.now() });
  return banned;
}
export function forgetUserStatus(userId) { _status.delete(userId); }

// Middleware: request có token của người bị khóa (hoặc tài khoản đã xóa) → hủy token, trả 403
export function blockBannedUsers(tokenOf) {
  return async (req, res, next) => {
    const a = tokenOf(req);
    if (!a) return next();
    try {
      if (await isBanned(a.userId)) {
        dbm.logout(a.token);
        return res.status(403).json({ error: "Tài khoản đã bị khóa hoặc không còn tồn tại" });
      }
    } catch {}
    next();
  };
}
export { isBanned };
