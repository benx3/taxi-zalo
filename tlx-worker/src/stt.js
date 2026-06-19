// ============================================================
// stt.js — Speech-to-Text: voice Zalo → text tiếng Việt
// Provider: FPT.AI (FPT_STT_API_KEY trong .env)
// - Không ghi file; chỉ giữ buffer trong RAM trong lúc xử lý
// - Cache 10 phút theo msgId để tránh gọi API 2 lần
// - Mọi lỗi đều bắt, trả null, không crash listener
// ============================================================

import { config } from "./config.js";
const FPT_STT_URL = "https://api.fpt.ai/hmi/asr/general";
// Lấy key tại thời điểm gọi: ưu tiên DB (config), fallback env
const getApiKey = () => config.fptSttApiKey || process.env.FPT_STT_API_KEY || null;
const DOWNLOAD_TIMEOUT_MS = 12_000;
const STT_TIMEOUT_MS = 20_000;
const CACHE_TTL = 10 * 60 * 1000;

// cache: msgId → { text, expires }
const _cache = new Map();

function _cacheGet(key) {
  const e = _cache.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) { _cache.delete(key); return undefined; }
  return e.text;
}
function _cacheSet(key, text) {
  _cache.set(key, { text, expires: Date.now() + CACHE_TTL });
  // dọn cache cũ
  if (_cache.size > 300) {
    const now = Date.now();
    for (const [k, v] of _cache) if (v.expires < now) _cache.delete(k);
  }
}

/**
 * Dịch URL file voice → text tiếng Việt qua FPT.AI STT.
 * Trả null nếu: chưa cấu hình API key, lỗi mạng, không nhận ra nội dung.
 */
export async function transcribeVoice(fileUrl, msgId) {
  const API_KEY = getApiKey();
  if (!API_KEY) return null;

  const cacheKey = msgId || fileUrl;
  const cached = _cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // 1. Tải file về RAM (không ghi đĩa)
    const dlRes = await fetch(fileUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!dlRes.ok) throw new Error(`Tải voice thất bại HTTP ${dlRes.status}`);
    const buffer = await dlRes.arrayBuffer();

    // 2. Xác định MIME từ đuôi URL
    const ext = (fileUrl.match(/\.(\w+)(?:\?|$)/) || [])[1]?.toLowerCase() || "m4a";
    const mime = { m4a: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg" }[ext] || "audio/mp4";

    // 3. Gửi tới FPT.AI STT
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), `voice.${ext}`);

    const sttRes = await fetch(FPT_STT_URL, {
      method: "POST",
      headers: { "api-key": API_KEY },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!sttRes.ok) throw new Error(`FPT STT HTTP ${sttRes.status}`);

    const data = await sttRes.json();
    // FPT trả: { hypotheses: [{ utterance: "..." }] } hoặc { text: "..." }
    const text = (data?.hypotheses?.[0]?.utterance || data?.text || "").trim() || null;

    if (text) _cacheSet(cacheKey, text);
    return text;
  } catch (e) {
    console.error(`[STT] ${msgId || fileUrl}:`, e?.message || e);
    return null;
  }
}

/**
 * Lấy URL file âm thanh từ content object của zca-js.
 * Thử nhiều tên trường khác nhau giữa các phiên bản zca-js.
 */
export function getVoiceUrl(content, msgData) {
  if (!content && !msgData) return null;

  const parsedContent = parseMaybeJson(content);
  const source = (parsedContent && typeof parsedContent === "object") ? parsedContent : content;

  // Kiểm tra type có phải voice/audio không
  const mt = String(
    source?.type || source?.msgType || msgData?.msgType || ""
  ).toLowerCase();

  // Tập hợp các URL candidate từ nhiều trường phổ biến + nested data
  const candidates = [
    source?.href,
    source?.url,
    source?.fileUrl,
    source?.voiceUrl,
    source?.audio,
    source?.streamUrl,
    source?.file?.url,
    source?.media?.[0]?.url,
    source?.data?.url,
    msgData?.href,
    msgData?.url,
    msgData?.fileUrl,
    msgData?.voiceUrl,
    msgData?.content?.url,
    ...collectHttpUrls(source),
    ...collectHttpUrls(msgData),
  ].filter(u => typeof u === "string" && u.startsWith("http"));

  // Ưu tiên URL có đuôi audio rõ ràng
  const byExt = candidates.find(u => /\.(m4a|aac|mp3|wav|ogg)(\?|$)/i.test(u));
  if (byExt) return byExt;

  // Nếu type là voice/audio thì lấy URL đầu tiên bất kể đuôi
  if (/voice|audio/.test(mt) && candidates.length) return candidates[0];

  // Zalo thường dùng msgType số: 10 = voice
  if ((mt === "10" || Number(msgData?.msgType) === 10) && candidates.length) return candidates[0];

  return null;
}

function parseMaybeJson(content) {
  if (typeof content !== "string") return content;
  const trimmed = content.trim();
  if (!trimmed) return content;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return content;
  try {
    return JSON.parse(trimmed);
  } catch {
    return content;
  }
}

function collectHttpUrls(input, depth = 0, maxDepth = 5, out = []) {
  if (!input || depth > maxDepth) return out;
  if (typeof input === "string") {
    const s = input.trim();
    if (/^https?:\/\//i.test(s)) out.push(s);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectHttpUrls(item, depth + 1, maxDepth, out);
    return out;
  }
  if (typeof input === "object") {
    for (const value of Object.values(input)) collectHttpUrls(value, depth + 1, maxDepth, out);
  }
  return out;
}
