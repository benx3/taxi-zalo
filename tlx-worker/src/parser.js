// ============================================================
// parser.js — bóc tách tin nhắn cuốc xe thành object có cấu trúc
// ============================================================

const CLAIM_RE = /\b(ok|oke|oki|okie|okib|ib)\b/i;
const NOISE_RE = /(lịch hủy|huỷ lịch|hủy lịch|đã có ng|đã có người|đã bay|bay rồi|sản giúp|san giúp|san hộ|san ho|sản hộ|lưu ý|luu y|dbcl|cảm ơn|cám ơn|thank|ck rồi|đã ck|nhận luôn|nhan luon|máu ko|máu không)/i;

export function isClaimMessage(text) {
  if (!text) return false;
  const t = text.trim();
  // Strip leading @mention so "@Tên đầy đủ ok" still counts as a claim
  const core = t.replace(/^@.+?\s+(?=(?:ok|oke|oki|okie|okib|ib)(?:\W|$))/i, "").trim();
  const hasPrice = /\d{2,4}\s*k|\dtr|\d[\d.]{2,}\s*đ/i.test(t);
  return !hasPrice && core.length <= 25 && CLAIM_RE.test(core);
}

export function isConfirmMessage(text) {
  if (!text) return false;
  return /ok\W*ib/i.test(text);
}

export function isNoiseMessage(text) {
  if (!text) return false;
  const t = text.trim();
  if (/^@/.test(t)) return true;
  if (NOISE_RE.test(t)) return true;
  if (/@/.test(t) && CLAIM_RE.test(t) && !hasRouteHint(t)) return true;
  return false;
}
function hasRouteHint(t) {
  const hasArrow = /={0,3}>{1,}|-{2,}>|→|về |ve |lên |len |đi |di /i.test(t);
  const hasPrice = /\d{2,4}\s*k|\dtr|\d[\d.]{2,}\s*đ/i.test(t);
  const hasTime = /\d{1,2}\s*h|\d{1,2}\s*p\b/i.test(t);
  return (hasArrow || hasTime) && hasPrice;
}

// ----- ĐIỂM EXPLICIT: "1đ","1d","1điểm","1diem","0,5đ","0.5 d","0,5" cuối câu -----
export function parseBonus(t) {
  // Có đơn vị rõ: "1đ", "0,5 đ", "1điểm", "1 điểm", "1d", "1diem", "0.5diem"
  const m = t.match(/(\d+(?:[,\.]\d+)?)\s*(điểm|diem|đ|d)(?=\s|$)/i);
  if (m) {
    const val = parseFloat(m[1].replace(",", "."));
    if (val > 0 && val <= 20) return val;
  }
  // Số thập phân cuối câu không có đơn vị: "500k tg. 0,5"
  const tail = t.match(/(?:^|\s)(\d+[,\.]\d+)\s*$/);
  if (tail) {
    const val = parseFloat(tail[1].replace(",", "."));
    if (val > 0 && val <= 10) return val;
  }
  return null;
}

// ----- GIÁ: hỗ trợ 200k / 1tr / 1tr300 / 1tr300k / 200.000đ / 200000 -----
export function parsePrice(t) {
  // 1tr300k, 1tr3, 1 triệu 300
  const tr = t.match(/(\d)\s*(?:tr|triệu)\s*(\d{0,3})/i);
  if (tr) return parseInt(tr[1]) * 1000 + (tr[2] ? parseInt(tr[2].padEnd(3, "0")) : 0);
  // 200k / 350 k
  const k = t.match(/(\d{2,4})\s*k\b/i);
  if (k) return parseInt(k[1]);
  // 200.000đ / 200.000 đ / 1.300.000đ  → quy về "k"
  const dong = t.match(/(\d{1,3}(?:[.,]\d{3})+)\s*đ?/);
  if (dong) {
    const num = parseInt(dong[1].replace(/[.,]/g, ""));
    if (num >= 50000) return Math.round(num / 1000);
  }
  return null;
}

// ----- THỜI GIAN: 8h / 8h30 / 30p (sắp đi) / csct,cnct (đi ngay) / sáng mai -----
export function parseTime(t) {
  if (/sáng mai|ngày mai|\bmai\b/i.test(t)) return { label: "Ngày mai", bucket: "tomorrow" };
  // csct = càng sớm càng tốt, cnct = càng nhanh càng tốt → đi ngay
  if (/\bcsct\b|cs ct|\bcnct\b|cn ct|đi ngay|đi luôn|gấp\b|gap\b/i.test(t)) {
    // nếu có kèm giờ cụ thể thì ưu tiên giờ (xử lý bên dưới), nếu không → "Đi ngay"
    if (!/\d{1,2}\s*h/i.test(t)) return { label: "Đi ngay", bucket: "soon" };
  }
  // "30p" / "15-20p" → sắp đi ngay
  const phut = t.match(/(\d{1,3})\s*p\b/i);
  if (phut && !/\dh/i.test(t.slice(0, t.indexOf(phut[0])))) {
    return { label: `${phut[1]}p nữa`, bucket: "soon" };
  }
  // giờ: "16h", "8h30", "07h30-08h"; tránh nuốt "2ghế" thành phút
  const m = t.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
  if (m) {
    const hh = parseInt(m[1]);
    const mm = m[2] ? m[2] : "";
    const nowVN = new Date(Date.now() + 7 * 3600000);
    const diff = ((hh - nowVN.getUTCHours()) + 24) % 24;
    return { label: `${hh}h${mm}`, bucket: diff <= 8 ? "soon" : "today", hh };
  }
  return { label: "Linh hoạt", bucket: "today" };
}

export function parseCar(t) {
  const l = t.toLowerCase();
  if (/5vf6|x7|7\s*chỗ|7c|bx\s*7|1bx\s*7/.test(l)) return "Xe 7c+";
  if (/vf6|seđan|sedan|x4|4\s*chỗ|4c/.test(l)) return "Sedan/4c";
  return null;
}

export function parseSeats(t) {
  const l = t.toLowerCase();
  const nk = l.match(/\b([1-6])\s*k\b/);
  if (nk) return nk[1] === "1" ? "1 ghế" : nk[1] + " khách";
  if (/2\s*ghế|2ghế|2\s*khách|2ghép|2ghep/.test(l)) return "2 khách";
  if (/bao\s*hàng|bao\s*xe|bxe|1bx|\bbx\b|bx\d+/.test(l)) return "Bao xe";
  if (/1\s*ghế|1ghế|1ghê|1ghép|1ghep/.test(l)) return "1 ghế";
  return "Không rõ";
}

export function parseType(t) {
  const l = t.toLowerCase();
  if (/(bao\s*hàng|csct\s*đồ|\bđồ\b|gửi hàng|ship)/.test(l) && !/1\s*ghế|1k\b|gái|khách/.test(l)) return "Hàng";
  if (/bao\s*xe|\bbxe\b|\bbx\b|bx\d+|\bxe\s*7\b|7\s*chỗ|\b7c\b/.test(l)) return "Bao xe";
  if (/sân\s*bay|nội\s*bài|noi\s*bai|\bt1\b|\bt2\b|sảnh/.test(l)) return "Sân bay";
  if (/2\s*ghế|2ghế|2ghép|2ghep|2\s*khách|2k\b/.test(l)) return "Ghép 2";
  return "Ghép 1";
}

// ----- TUYẾN: tách điểm đón → điểm đến, làm sạch giờ/ghế/giá ở đầu -----
// Dấu phân tách rất đa dạng: >>>, --->, =>>>, ==}}, ->, →, "về", "đi",
// gạch dưới dài ____, gạch nối " - ", dấu ".." v.v.
const ROUTE_SPLIT = /\s*(?:={0,3}>{1,}|-{2,}>?|->|→|⇒|»+|_{2,}|\u2192|\.{3,}|\s-\s|\bvề\b|\bve\b|\blên\b|\blen\b|\bđi\b(?!\s*ngay)|\bra\b|\bsang\b)\s*/i;

export function parseRoute(t) {
  let parts = t.split(ROUTE_SPLIT).map(s => s.trim()).filter(s => s.length > 1);
  // bỏ các mảnh chỉ toàn ký tự rác
  parts = parts.filter(s => /[a-zA-ZÀ-ỹ]/.test(s));
  if (parts.length >= 2) {
    const from = cleanPlace(parts[parts.length - 2]);
    const to = cleanPlace(parts[parts.length - 1]);
    if (from || to) return { from: from || "?", to: to || "?" };
  }
  // không có dấu phân tách rõ → tách raw TRƯỚC (tránh cleanPlace.slice(32) cắt mất địa chỉ đến)
  if (parts.length === 1) {
    const rawParts = parts[0].split(/\s+(?:về|ve|ra|sang|đi)\s+/i);
    if (rawParts.length >= 2) {
      const from = cleanPlace(rawParts[0]);
      const to = cleanPlace(rawParts[rawParts.length - 1]);
      if (from || to) return { from: from || "?", to: to || "?" };
    }
    const only = cleanPlace(parts[0]);
    if (only) return { from: "?", to: only };
  }
  return null;
}

// bỏ phần giờ/số ghế/csct/free/ghi chú ở đầu và giá/đuôi ở cuối
function cleanPlace(s) {
  let prev;
  do {
    prev = s;
    s = s
      // các từ khoá ở ĐẦU. KHÔNG dùng \b (sai với chữ Việt có dấu); dùng (?=[\s.:,_-]|$)
      .replace(/^\s*(csct|cs ct|cnct|cn ct|free+|fr+ee|fer+|vtri|vt|vị trí|yc|dự|sm|sd|sáng mai|ngày mai|mai|gấp|gap)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")
      .replace(/^\s*\d{1,2}\s*(?:[-–]\s*\d{1,2})?\s*[h:]\s*\d{0,2}\s*(?:[-–_]\s*\d{1,2}\s*[h:]?\s*\d{0,2})?\s*(sm|sáng mai)?[\s.:,_-]*/i, "") // "22h","6h30","5-6h","6h_6h30","5-6h sm"
      .replace(/^\s*\d{1,3}\s*p(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "30p"
      .replace(/^\s*\d+\s*(ghép|ghế|ghê|ghé|gh|khách|khach|kh|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "") // "1 ghế","1ghép","1k","1g"
      .replace(/^\s*(ghép|ghế|ghê|ghé|bao\s*xe|bao\s*hàng|bxe|bx\d*|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "ghép","bao xe","k","g" lẻ
      .replace(/^\s*(để|de|đồ|do|hàng|hang|gửi|gui|ship|chở|cho|đón|don|lấy|lay|trả|tra|màn\s*máy\s*tính|màn|man|máy\s*tính|may\s*tinh)(?=[\s.:,_-]|$)[\s.:,_-]*/i, ""); // ghi chú đồ vật
  } while (s !== prev && s.length > 0);
  return s
    .replace(/\d[\d.,]*\s*(k|đ|nghìn|tr|triệu)\b.*$/i, "")  // giá có đơn vị + đuôi
    .replace(/\d{1,3}(?:[.,]\d{3})+\s*đ?.*$/i, "")          // giá "200.000"
    .replace(/\b(free+|fr+ee|fer+|tg|tgct|tgian|ki\d+|sd|cl|0[.,]5)\b.*$/i, "")
    .replace(/khách\s*(cần|can|có mặt|co mat).*/i, "")       // bỏ ghi chú "khách cần có mặt 8h40"
    .replace(/_{2,}/g, " ")                                  // gạch dưới dài → space
    .replace(/^[\s\-.,:;>()_]+|[\s\-.,:;>()_]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 32);
}

// Tách 1 tin nhắn có thể chứa NHIỀU cuốc → mảng cuốc
// Quy tắc: CHỈ tách khi nhiều dòng đều có giá riêng.
// Nếu ≤1 dòng có giá → nhiều khả năng là 1 cuốc viết nhiều dòng → parse tổng.
export function parseMultipleTrips(raw) {
  const fullText = (raw.text || "").trim();
  if (!fullText) return [];

  const lines = fullText.split(/\n+/).map(s => s.trim()).filter(s => s.length > 5);
  if (lines.length <= 1) {
    const t = parseTrip(raw);
    return t ? [t] : [];
  }

  // Đếm số dòng có giá hợp lệ riêng
  const linesWithPrice = lines.filter(l => {
    const p = parsePrice(l);
    return p !== null && p >= 50 && p <= 5000;
  });

  // ≤1 dòng có giá → 1 cuốc viết nhiều dòng, parse tổng
  if (linesWithPrice.length <= 1) {
    const t = parseTrip(raw);
    return t ? [t] : [];
  }

  // Nhiều dòng có giá → tách thành nhiều cuốc
  const results = [];
  for (const line of lines) {
    const t = parseTrip({ ...raw, text: line });
    if (t) results.push(t);
  }
  // Fallback nếu split không parse được gì
  if (results.length === 0) {
    const t = parseTrip(raw);
    return t ? [t] : [];
  }
  return results;
}

// Hàm chính: tin thô → object cuốc. Trả null nếu không phải cuốc.
// QUY TẮC VÀNG: có giá tiền → 99% là cuốc xe. Vì vậy ưu tiên giá:
//   - Không có giá hợp lệ → bỏ (gần như chắc không phải cuốc).
//   - Có giá → coi là cuốc, TRỪ KHI chắc chắn là rác (ok/ib, hủy, sản điểm).
export function parseTrip(raw) {
  const text = (raw.text || "").trim();
  if (!text) return null;

  const price = parsePrice(text);
  // không có giá hợp lệ → không phải cuốc
  if (!price || price < 50 || price > 5000) return null;

  // có giá rồi, nhưng vẫn loại nếu là tin chốt/hủy/sản chắc chắn:
  if (isClaimMessage(text)) return null;       // chỉ ok/ib (không kèm giá thật)
  if (isHardNoise(text)) return null;          // hủy lịch / sản điểm / xác nhận rõ ràng

  const explicitPoints = parseBonus(text);
  return {
    groupId: raw.groupId,
    group: raw.groupName,
    senderId: raw.senderId,
    sender: raw.senderName,
    msgId: raw.msgId,
    t: raw.time,
    text,
    price,
    time: parseTime(text),
    car: parseCar(text),
    seats: parseSeats(text),
    type: parseType(text),
    route: parseRoute(text),
    free: /free+|fr+ee/i.test(text),
    explicitPoints,
    bonus: explicitPoints !== null ? `${explicitPoints}đ` : null,
  };
}

// Rác CHẮC CHẮN — chỉ loại khi rất rõ, tránh loại nhầm cuốc có giá.
// (mở đầu @tên, hoặc chứa từ hủy/sản/xác nhận điểm)
function isHardNoise(text) {
  const t = text.trim();
  if (/^@/.test(t)) return true;                 // reply người khác
  if (NOISE_RE.test(t)) return true;             // hủy lịch, sản điểm, ck rồi...
  return false;
}
