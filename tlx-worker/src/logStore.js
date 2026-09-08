// ============================================================
// logStore.js — Thu lại log hệ thống để admin xem trên web,
// khỏi phải SSH vào VPS chạy `pm2 logs` mò tìm.
//
// Hai tầng:
//  · Vòng đệm RAM  — giữ mọi mức (info/warn/error) gần nhất, xem nhanh, mất khi restart
//  · DB system_logs — chỉ lưu warn/error, sống sót qua restart để mổ xẻ sự cố sau
//
// Cách thu: bọc console.log/warn/error. Vẫn in ra stdout như cũ nên PM2 không mất log.
// ============================================================

const RING_MAX = 1500;
const ring = [];
let seq = 0;
let dbSink = null;
let inSink = false;          // chống đệ quy nếu dbSink lỡ gọi console
let patched = false;

// Rút gọn tham số console về chuỗi đọc được
function fmtArg(a) {
  if (typeof a === "string") return a;
  if (a instanceof Error) return `${a.message}\n${a.stack || ""}`;
  try { return JSON.stringify(a); } catch { return String(a); }
}

// Bỏ mã màu ANSI (zca-js in log có màu)
const stripAnsi = (s) => s.replace(/\[[0-9;]*m/g, "");

// Tách nhãn nguồn dạng "[abc-123]" hoặc "[BAREM_E]" ở đầu dòng,
// đồng thời bỏ nó khỏi nội dung để UI không hiện lặp 2 lần.
function splitSource(text) {
  const m = text.match(/^\s*\[([^\]]{1,48})\]\s*/);
  return m ? { source: m[1], body: text.slice(m[0].length) } : { source: null, body: text };
}

function push(level, text) {
  const { source, body } = splitSource(text);
  const entry = {
    id: ++seq,
    level,
    source,
    message: body.length > 4000 ? body.slice(0, 4000) + "…" : body,
    ts: Date.now(),
  };
  ring.push(entry);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);

  // Chỉ lưu DB những mức đáng quan tâm
  if (dbSink && !inSink && (level === "error" || level === "warn")) {
    inSink = true;
    Promise.resolve(dbSink(level, entry.source, entry.message, entry.ts))
      .catch(() => {})
      .finally(() => { inSink = false; });
  }
}

// Bọc console — gọi 1 lần lúc khởi động
export function initLogCapture(persistFn) {
  dbSink = persistFn || null;
  if (patched) return;
  patched = true;
  for (const [method, level] of [["log", "info"], ["warn", "warn"], ["error", "error"]]) {
    const orig = console[method].bind(console);
    console[method] = (...args) => {
      orig(...args);                                   // giữ nguyên output cho PM2
      try { push(level, stripAnsi(args.map(fmtArg).join(" ")).trimEnd()); } catch {}
    };
  }
}

// Đọc vòng đệm RAM, mới nhất trước
export function getLiveLogs({ level, search, limit = 300 } = {}) {
  const kw = (search || "").trim().toLowerCase();
  let out = ring;
  if (level && level !== "all") {
    out = out.filter(e => level === "problem" ? (e.level === "error" || e.level === "warn") : e.level === level);
  }
  if (kw) out = out.filter(e => e.message.toLowerCase().includes(kw) || (e.source || "").toLowerCase().includes(kw));
  return out.slice(-limit).reverse();
}

export function getLogStats() {
  const now = Date.now(), h1 = now - 3600_000;
  let err = 0, warn = 0, err1h = 0, warn1h = 0;
  for (const e of ring) {
    if (e.level === "error") { err++; if (e.ts >= h1) err1h++; }
    else if (e.level === "warn") { warn++; if (e.ts >= h1) warn1h++; }
  }
  return { total: ring.length, errors: err, warns: warn, errors1h: err1h, warns1h: warn1h,
           oldestTs: ring[0]?.ts || null };
}
