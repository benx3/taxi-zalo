// ============================================================
// crypto.js — tiện ích bảo mật dùng chung
//  - Mật khẩu: bcrypt (có salt, chậm có chủ đích chống brute-force)
//  - Cookie Zalo: AES-256-GCM (mã hoá đối xứng, có xác thực toàn vẹn)
//
// CẦN biến môi trường APP_SECRET (chuỗi ngẫu nhiên dài) để dẫn xuất khoá AES.
// Tạo nhanh:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
// ============================================================
import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

// ---------- Mật khẩu ----------
export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}
export async function verifyPassword(plain, hash) {
  if (!hash) return false;
  // hash bcrypt bắt đầu bằng $2a$/$2b$/$2y$
  if (/^\$2[aby]\$/.test(hash)) {
    try { return await bcrypt.compare(String(plain), hash); } catch { return false; }
  }
  // hash cũ kiểu SHA-256 (64 ký tự hex) — so khớp để còn nâng cấp dần
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    const legacy = crypto.createHash("sha256").update(String(plain)).digest("hex");
    return legacy === hash;
  }
  return false;
}
// nhận biết hash cũ để tự nâng cấp sang bcrypt khi user đăng nhập đúng
export function isLegacyHash(hash) {
  return !!hash && /^[a-f0-9]{64}$/i.test(hash) && !/^\$2[aby]\$/.test(hash);
}

// ---------- Mã hoá cookie Zalo (AES-256-GCM) ----------
function getKey() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    // Không có secret → không mã hoá (dev). Cảnh báo để production nhớ đặt.
    return null;
  }
  // dẫn xuất khoá 32 byte ổn định từ APP_SECRET
  return crypto.createHash("sha256").update(secret).digest();
}

// Trả về chuỗi "enc:v1:<iv>:<tag>:<ciphertext>" (base64) hoặc plaintext nếu chưa có secret.
export function encryptSecret(plainText) {
  const key = getKey();
  const data = typeof plainText === "string" ? plainText : JSON.stringify(plainText);
  if (!key) return data; // dev: lưu thẳng
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

// Giải mã ngược lại. Nhận cả dữ liệu cũ chưa mã hoá (tương thích ngược).
export function decryptSecret(stored) {
  if (stored == null) return null;
  if (typeof stored !== "string" || !stored.startsWith("enc:v1:")) {
    return stored; // dữ liệu cũ lưu thẳng (chưa mã hoá)
  }
  const key = getKey();
  if (!key) throw new Error("Thiếu APP_SECRET để giải mã cookie Zalo");
  const [, , ivB64, tagB64, ctB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
