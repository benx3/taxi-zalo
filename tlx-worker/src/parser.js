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
  return /ok\W*i[bp]/i.test(text);
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

// ----- ĐIỂM EXPLICIT: "1đ","1d","1điểm","1diem","1 diem","1 đ","1 d","0,5đ" -----
export function parseBonus(t) {
  // Hỗ trợ: xd / xđ / xdiem / xđiểm / x d / x đ / x diem / x điểm (x = số, kể cả thập phân)
  const m = t.match(/(\d+(?:[,\.]\d+)?)\s*(điểm|diem|đ|d)(?!\w)/i);
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
  if (/\bcsct\b|cs ct|\bcnct\b|cn ct|\bsnct\b|sn ct|đi ngay|đi luôn|gấp\b|gap\b/i.test(t)) {
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
  if (/x29|29\s*chỗ/.test(l)) return "Xe 29c";
  if (/x16|16\s*chỗ/.test(l)) return "Xe 16c";
  if (/5vf6|x7|7\s*chỗ|7c|bx\s*7|1bx\s*7/.test(l)) return "Xe 7c+";
  if (/vf6|seđan|sedan|x4|4\s*chỗ|4c/.test(l)) return "Sedan/4c";
  if (/\bx5\b|5\s*chỗ|\b5c\b/.test(l)) return "Sedan/5c";
  return null;
}

export function parseSeats(t) {
  const l = t.toLowerCase();
  // N k (standalone "k") — "1k"=1 ghế, "2k"/"3k"=N khách
  const nk = l.match(/\b([1-6])\s*k\b/);
  if (nk) return nk[1] === "1" ? "1 ghế" : nk[1] + " khách";
  // 3 khách: 3ghế/3ghép/3kh/3gh/3g/3ghe và biến thể có khoảng trắng
  if (/3\s*(?:khách|khach|kh\b|ghế|ghê|ghé|ghép|ghep|ghe\b|gh\b|g\b)/.test(l)) return "3 khách";
  // 2 khách: 2ghế/2ghép/2kh/2gh/2g/2ghe và biến thể có khoảng trắng
  if (/2\s*(?:khách|khach|kh\b|ghế|ghê|ghé|ghép|ghep|ghe\b|gh\b|g\b)/.test(l)) return "2 khách";
  // Bao xe (check trước để "1bx" không nhầm thành 1 ghế)
  if (/bao\s*hàng|bao\s*xe|bxe|1bx|\bbx\b|bx\d+/.test(l)) return "Bao xe";
  // 1 ghế: 1ghế/1ghép/1kh/1gh/1g/1ghe và biến thể có khoảng trắng
  if (/1\s*(?:khách|khach|kh\b|ghế|ghê|ghé|ghép|ghep|ghe\b|gh\b|g\b)/.test(l)) return "1 ghế";
  return "Không rõ";
}

export function parseType(t) {
  const l = t.toLowerCase();
  if (/(bao\s*hàng|csct\s*đồ|(?:^|[\s\d,.])\s*đồ\s|gửi\s*hàng|giao\s*hàng|chở\s*hàng|ship\b|kiện\s*hàng|hàng\s+(?:nhỏ|nặng|lớn|to|bé|gọn|cồng|kềnh))/.test(l) && !/1\s*ghế|1k\b|gái|khách/.test(l)) return "Hàng";
  if (/bao\s*xe|\bbxe\b|\bbx\b|bx\d+|\bxe\s*7\b|7\s*chỗ|\b7c\b|\blịch\s*taxi\b|\btaxi\b/.test(l)) {
    if (/bx\s*2c\b|bxe\s*2c\b|bao\s*xe\s*2c\b|2\s*chi[eề]u|2\s*chieu/.test(l)) return "Bao xe 2 chiều";
    return "Bao xe";
  }
  if (/sân\s*bay|nội\s*bài|noi\s*bai|\bnb\b|\bsb\b|\bt1\b|\bt2\b|sảnh/.test(l)) {
    if (/2\s*chi[eề]u|\b2c\b/.test(l)) return "Sân bay 2 chiều";
    if (/ti[eễ]n|đưa\s*đi|dua\s*di/.test(l)) return "Sân bay tiễn";
    if (/\bđón\b|\bdon\b|ra\s*đón|ra\s*don/.test(l)) return "Sân bay đón";
    return "Sân bay";
  }
  if (/3\s*(?:khách|khach|kh\b|ghế|ghê|ghé|ghép|ghep|gh\b|g\b)|3k\b/.test(l)) return "Ghép 3";
  if (/2\s*(?:khách|khach|kh\b|ghế|ghê|ghé|ghép|ghep|gh\b|g\b)|2k\b/.test(l)) return "Ghép 2";
  return "Ghép 1";
}

// ----- TUYẾN: tách điểm đón → điểm đến, làm sạch giờ/ghế/giá ở đầu -----
// Dấu phân tách rất đa dạng: >>>, --->, =>>>, ==}}, ->, →, "về", "đi",
// gạch dưới dài ____, gạch nối " - ", dấu ".." v.v.
const ROUTE_SPLIT = /\s*(?:={0,3}[>}]{1,}|-{2,}>?|->|→|⇒|»+|_{2,}|\u2192|\.{3,}|\s-\s(?!\d)|(?<=[a-zA-Z\xC0-ỹ])-(?=[a-zA-Z\xC0-ỹ])|\bvề\b|\bve\b|\blên\b(?!\s*(?:xe|tàu|tau|phà|pha|bus|máy|may)\b)|\blen\b|\bđi\b(?!\s*ngay)|\bra\b|\bsang\b)\s*/i;

export function parseRoute(t) {
  // Strip nội dung ngoặc đơn (...) — luôn là ghi chú, không phải địa điểm
  // Strip ---- (4+ dashes) trở đi cuối mỗi dòng — thường là divider trang trí
  t = t
    .replace(/\([^)]{0,80}\)/g, " ")
    .replace(/-{4,}[^a-zA-ZÀ-ỹ\d]*$/gm, "")
    .replace(/\s+/g, " ").trim();
  let parts = t.split(ROUTE_SPLIT).map(s => s.trim()).filter(s => s.length > 1);
  // bỏ các mảnh chỉ toàn ký tự rác hoặc thuần giá tiền (900k, 1tr, 200đ)
  parts = parts.filter(s => /[a-zA-ZÀ-ỹ]/.test(s) && !/^\d[\d.,]*\s*(k|tr|đ|nghìn|triệu)?\s*$/i.test(s));
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
      // số hiệu chuyến bay: VJ123, VN204, QH123, BL456, VU789...
      .replace(/^\s*[A-Z]{2}\d{3,4}\b[\s.:,_-]*/i, "")
      // các từ khoá ở ĐẦU. KHÔNG dùng \b (sai với chữ Việt có dấu); dùng (?=[\s.:,_-]|$)
      .replace(/^\s*(csct|cs ct|cnct|cn ct|snct|sn ct|free+|fr+ee|fer+|vtri|vt|vị trí|yc|ycvt|dự|sm|sd|sáng mai|ngày mai|mai|gấp|gap)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")
      .replace(/^\s*\d{1,2}\s*(?:[-–]\s*\d{1,2})?\s*[h:]\s*\d{0,2}\s*p?\s*(?:[-–_]\s*\d{1,2}\s*[h:]?\s*\d{0,2}\s*p?)?\s*(sm|sáng mai)?[\s.:,_-]*/i, "") // "22h","6h30","5-6h","0h25p","6h_6h30"
      .replace(/^\s*\d{1,3}\s*p(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "30p"
      .replace(/^\s*\d+\s*(ghép|ghế|ghê|ghé|ghe|gh|khách|khach|kh|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "") // "1 ghế","1ghép","1k","1g","1ghe"
      .replace(/^\s*(ghép|ghế|ghê|ghé|bao\s*xe|bao\s*hàng|bxe|bx\d*|k|g)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "ghép","bao xe","k","g" lẻ
      .replace(/^\s*\d*\s*(chiều|chieu)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "")  // "2 chiều","1 chiều" lẻ đầu
      .replace(/^\s*(để|de|đồ|do|hàng|hang|gửi|gui|ship|chở|cho|đón|don|lấy|lay|trả|tra|màn\s*máy\s*tính|màn|man|máy\s*tính|may\s*tinh)(?=[\s.:,_-]|$)[\s.:,_-]*/i, "") // ghi chú đồ vật
      // giá tiền đứng trước địa điểm, cách nhau bởi dấu phẩy: "200k, thạch bàn" → "thạch bàn"
      .replace(/^\s*\d[\d.,]*\s*(k|đ|nghìn|tr|triệu)\b\s*[,.:;]+\s*/i, "");
  } while (s !== prev && s.length > 0);
  return s
    .replace(/\d[\d.,]*\s*(k|đ|nghìn|tr|triệu)\b.*$/i, "")  // giá có đơn vị + đuôi
    .replace(/\d{1,3}(?:[.,]\d{3})+\s*đ?.*$/i, "")          // giá "200.000"
    .replace(/\b(free+|fr+ee|fer+|tg|tgct|tgian|ki\d+|sd|cl|0[.,]5)\b.*$/i, "")
    .replace(/khách\s*(cần|can|có mặt|co mat).*/i, "")       // bỏ ghi chú "khách cần có mặt 8h40"
    .replace(/\b(lb|lx|cl|dv\d?|ck|tk|cth)\s*[-:]?\s*$/i, "") // bỏ suffix noise cuối: lb-, lx, dv1...
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
  if (/^\+\s*\d+\s*ngh\b/i.test(t)) return true; // "+ 2ngh 400k" = phụ phí nghỉ đêm
  return false;
}
