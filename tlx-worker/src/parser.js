// ============================================================
// parser.js — bóc tách tin nhắn cuốc xe thành object có cấu trúc
// ============================================================

const CLAIM_RE = /\b(ok|oke|oki|okie|okib|ib)\b/i;
const NOISE_RE = /(lịch hủy|huỷ lịch|hủy lịch|đã có ng|đã có người|đã bay|bay rồi|sản giúp|san giúp|san hộ|san ho|sản hộ|sản\b|san\b|lưu ý|luu y|dbcl|cảm ơn|cám ơn|thank|ck rồi|đã ck|nhận luôn|nhan luon|máu ko|máu không)/i;

export function isClaimMessage(text) {
  if (!text) return false;
  const t = text.trim();
  const hasPrice = /\d{2,4}\s*k|\dtr|\d[\d.]{2,}\s*đ/i.test(t);
  return !hasPrice && t.length <= 25 && CLAIM_RE.test(t);
}

export function isConfirmMessage(text) {
  if (!text) return false;
  return /ok\s*ib|okib/i.test(text);
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
  const hasArrow = />>>|--->|---->|=>|>>|->|→|về |ve |lên |len |đi |di /i.test(t);
  const hasPrice = /\d{2,4}\s*k|\dtr|\d[\d.]{2,}\s*đ/i.test(t);
  const hasTime = /\d{1,2}\s*h|\d{1,2}\s*p\b/i.test(t);
  return (hasArrow || hasTime) && hasPrice;
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
    return { label: `${hh}h${mm}`, bucket: hh <= 8 ? "soon" : "today", hh };
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
  if (/2\s*ghế|2ghế|2\s*khách|2k\b/.test(l)) return "2 khách";
  if (/bao\s*hàng|bao\s*xe|bxe|1bx|\bbx\b/.test(l)) return "Bao xe";
  if (/1\s*ghế|1ghế|1ghê|1\s*ghép|1k\b/.test(l)) return "1 ghế";
  return "Không rõ";
}

export function parseType(t) {
  const l = t.toLowerCase();
  if (/(bao\s*hàng|csct\s*đồ|\bđồ\b|gửi hàng|ship)/.test(l) && !/1\s*ghế|1k\b|gái|khách/.test(l)) return "Hàng";
  if (/bao\s*xe|\bbxe\b|\bbx\b/.test(l)) return "Bao xe";
  if (/sân\s*bay|nội\s*bài|noi\s*bai|\bt1\b|\bt2\b|sảnh/.test(l)) return "Sân bay";
  if (/2\s*ghế|2ghế|2\s*khách/.test(l)) return "Ghép 2";
  return "Ghép 1";
}

// ----- TUYẾN: tách điểm đón → điểm đến, làm sạch giờ/ghế/giá ở đầu -----
// Dấu phân tách rất đa dạng: >>>, --->, =>>>, ==}}, ->, →, "về", "đi",
// gạch dưới dài ____, gạch nối " - ", dấu ".." v.v.
const ROUTE_SPLIT = /\s*(?:={0,3}[}>\]]{1,}|>{2,}|-{2,}>?|=>+|→|⇒|»+|_{2,}|\u2192|\.{3,}|\s-\s|\bvề\b|\bve\b|\blên\b|\blen\b|\bđi\b(?!\s*ngay)|\bra\b|\bsang\b)\s*/i;

export function parseRoute(t) {
  let parts = t.split(ROUTE_SPLIT).map(s => s.trim()).filter(s => s.length > 1);
  // bỏ các mảnh chỉ toàn ký tự rác
  parts = parts.filter(s => /[a-zA-ZÀ-ỹ]/.test(s));
  if (parts.length >= 2) {
    const from = cleanPlace(parts[parts.length - 2]);
    const to = cleanPlace(parts[parts.length - 1]);
    if (from || to) return { from: from || "?", to: to || "?" };
  }
  // không có dấu phân tách rõ → thử tách lại theo "về/ra/sang/đi" bên trong mảnh đã làm sạch
  if (parts.length === 1) {
    let only = cleanPlace(parts[0]);
    const m = only.split(/\s+(?:về|ve|ra|sang|đi)\s+/i);
    if (m.length >= 2 && m[0].length > 1 && m[1].length > 1) {
      return { from: m[0].trim().slice(0, 32), to: m[1].trim().slice(0, 32) };
    }
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
      .replace(/^\s*(csct|cs ct|cnct|cn ct|free+|fr+ee|fer+|vtri|vt|vị trí|yc|dự|sm|sáng mai|ngày mai|mai|gấp|gap)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")
      .replace(/^\s*\d{1,2}\s*(?:[-–]\s*\d{1,2})?\s*[h:]\s*\d{0,2}\s*(?:[-–_]\s*\d{1,2}\s*[h:]?\s*\d{0,2})?\s*(sm|sáng mai)?[\s.:,_-]*/i, "") // "22h","6h30","5-6h","6h_6h30","5-6h sm"
      .replace(/^\s*\d{1,3}\s*p(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "30p"
      .replace(/^\s*\d+\s*(ghép|ghế|ghê|ghé|gh|khách|khach|kh|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "") // "1 ghế","1ghép","1k","1g"
      .replace(/^\s*(ghép|ghế|ghê|ghé|bao\s*xe|bao\s*hàng|bxe|bx|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "ghép","bao xe","k","g" lẻ
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
    bonus: /0,5|0\.5/.test(text) ? "0.5đ" : null,
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