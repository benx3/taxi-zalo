// ============================================================
// aiParser.js — Bóc tách cuốc xe bằng AI (Groq → Gemini fallback)
// Dùng khi regex không parse được. Hiểu viết tắt đặc thù nhóm taxi VIP.
// ============================================================
import { config } from "./config.js";

// Cache kết quả AI theo msgId — tránh gọi lại khi nhiều session cùng theo 1 nhóm
const _cache = new Map(); // msgId → { result, ts }
const CACHE_TTL = 5 * 60 * 1000; // 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _cache) if (now - v.ts > CACHE_TTL) _cache.delete(k);
}, 60_000);

const SYSTEM_PROMPT = `Bạn phân tích tin nhắn đặt xe taxi trong nhóm Zalo taxi VIP tại Việt Nam.
Trả về JSON hợp lệ duy nhất, không có markdown hay giải thích.

VIẾT TẮT THƯỜNG GẶP:
X4=xe 4 chỗ nhỏ (i10,Morning,Wigo,Fadil), X5=xe 5 chỗ Sedan có cốp, X7=xe 7 chỗ, X16=xe 16 chỗ, X29=xe 29 chỗ
bx/bxe/1bx/bao xe=bao xe (charter toàn xe), ghép=xe ghép chung nhiều khách
1k=1 khách, 2k=2 khách, 3k=3 khách (k ở đây là "khách", không phải nghìn đồng)
sb=sân bay, NB/nội bài=sân bay Nội Bài HN, T1=ga nội địa, T2=ga quốc tế
csct/snct=càng sớm càng tốt (đi ngay/gấp), tgct=trọn gói cao tốc
vtri/vt/ycvt=vị trí, cl=chủ lịch, sm=sáng mai, sd=sáng
free/fr=cuốc không tính điểm, 2c/2chiều=2 chiều (round trip)
tg=trọn gói, tk=thu khách, ck=chuyển khoản, cth=có thu hộ
>>> / ==>> / =>> / -> / → / về / lên / ra / sang = dấu phân tách tuyến đường
"..." hoặc ".." cũng có thể là dấu phân tách tuyến

GIÁ TIỀN — QUY ĐỔI VỀ NGHÌN ĐỒNG:
950k → 950 | 1tr → 1000 | 1tr3 → 1300 | 1tr300 → 1300 | 1tr300k → 1300 | 200.000đ → 200

TRƯỜNG JSON CẦN TRẢ VỀ:
{
  "isTrip": boolean,
  "price": number|null,
  "from": string|null,
  "to": string|null,
  "seats": "1 ghế"|"2 khách"|"3 khách"|"Bao xe"|"Không rõ",
  "type": "Ghép 1"|"Ghép 2"|"Ghép 3"|"Bao xe"|"Bao xe 2 chiều"|"Sân bay"|"Sân bay đón"|"Sân bay tiễn"|"Sân bay 2 chiều"|"Hàng",
  "timeLabel": string,
  "timeBucket": "soon"|"today"|"tomorrow",
  "car": "Xe 29c"|"Xe 16c"|"Xe 7c+"|"Sedan/4c"|"Sedan/5c"|null,
  "free": boolean,
  "isRoundTrip": boolean,
  "tripType": "nội thành"|"ngoại thành"|"liên tỉnh"
}

QUY TẮC isTrip:
- TRUE: có giá (số+k/tr/triệu/đồng) trong khoảng 50–5000k VÀ là cuốc xe/hàng thực sự
- FALSE: chỉ "ok/oke/oki/okie/ib", "hủy lịch/hủy/đã hủy", "cảm ơn/thank", "sản điểm/san điểm/sản giúp/san giúp", "đã ck/đã chuyển/đã bay", "@mention" đơn thuần, không có giá hợp lệ

QUY TẮC from/to:
- Chỉ tên địa điểm thuần túy (tên đường/phường/quận/huyện/tỉnh/địa danh), max 32 ký tự
- Bỏ hoàn toàn ở đầu: số ghế, giờ, giá, vtri/vt/ycvt/csct/snct/free/sm/sd/gấp
- Ví dụ: "vtri bx5 2chiều mỹ đình >>>>bạch mai 2...950k" → from="Mỹ Đình" to="Bạch Mai"
- Ví dụ: "8h sb tiễn 1k lăng cha cả 250k" → from="Lăng Cha Cả" to="Sân bay"

QUY TẮC type:
- "Hàng": ship/gửi hàng/chở hàng/kiện hàng/đồ (KHÔNG có từ "khách/người")
- "Bao xe": bx/bxe/bao xe; hoặc không ghi số ghế (mặc định bao xe)
- "Bao xe 2 chiều": bao xe + 2c/2chiều
- "Sân bay tiễn": đưa khách từ nội đô ra sân bay
- "Sân bay đón": đón khách từ sân bay về nội đô
- "Sân bay 2 chiều": đón và tiễn sân bay cả 2 chiều
- "Sân bay": có sân bay nhưng không rõ chiều
- "Ghép 1"/"Ghép 2"/"Ghép 3": theo số 1k/2k/3k hoặc 1 ghế/2 ghế/3 ghế

QUY TẮC seats:
- "bx"/"bxe"/"bao xe"/"1bx" hoặc không ghi số → "Bao xe"
- "1k"/"1ghế"/"1g"/"1 khách" → "1 ghế"
- "2k"/"2ghế"/"2 khách" → "2 khách"
- "3k"/"3ghế"/"3 khách" → "3 khách"

QUY TẮC timeLabel/timeBucket:
- csct/snct/đi ngay/đi luôn/gấp → timeLabel="Đi ngay" timeBucket="soon"
- "30p"/"15p" → timeLabel="30p nữa" timeBucket="soon"
- "sáng mai"/"mai" → timeLabel="Ngày mai" timeBucket="tomorrow"
- "8h30"/"16h" → timeLabel="8h30" timeBucket="soon" nếu trong vòng 8h, else "today"
- Không rõ → timeLabel="Linh hoạt" timeBucket="today"

QUY TẮC tripType — dùng kiến thức địa lý Việt Nam để xác định:
- "nội thành": cả 2 điểm đều nằm trong khu vực nội đô của cùng 1 thành phố (quận trung tâm, phố, đường nội thành)
- "ngoại thành": 1 trong 2 điểm là vùng ngoại ô/huyện ngoại thành của cùng tỉnh/thành phố đó, hoặc là sân bay phục vụ thành phố đó
- "liên tỉnh": 2 điểm thuộc 2 tỉnh/thành phố khác nhau; bến xe liên tỉnh (bx Mỹ Đình, bx Giáp Bát, bx Nước Ngầm...) thường là dấu hiệu liên tỉnh
- Nếu chỉ có 1 điểm hoặc không xác định được → ưu tiên "liên tỉnh" nếu giá cao (>400k), ngược lại "nội thành"`;

async function callGroq(text, key) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 350,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Groq ${r.status}: ${err.slice(0, 120)}`);
  }
  const d = await r.json();
  return JSON.parse(d.choices[0].message.content);
}

async function callGemini(text, key) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 350,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(12000),
    }
  );
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${err.slice(0, 120)}`);
  }
  const d = await r.json();
  return JSON.parse(d.candidates[0].content.parts[0].text);
}

export async function parseWithAI(text, msgId) {
  // Cache hit — cùng tin nhắn, nhiều session cùng nhóm không gọi AI lại
  if (msgId && _cache.has(msgId)) {
    return _cache.get(msgId).result;
  }

  const { groqApiKey, geminiApiKey } = config;
  let lastErr = null;
  let result = null;

  if (groqApiKey) {
    try {
      result = await callGroq(text, groqApiKey);
      console.log(`[AI] Groq OK — isTrip=${result?.isTrip} price=${result?.price}`);
    } catch (e) {
      lastErr = e;
      console.warn(`[AI] Groq lỗi: ${e.message}`);
    }
  }

  if (!result && geminiApiKey) {
    try {
      result = await callGemini(text, geminiApiKey);
      console.log(`[AI] Gemini OK — isTrip=${result?.isTrip} price=${result?.price}`);
    } catch (e) {
      lastErr = e;
      console.warn(`[AI] Gemini lỗi: ${e.message}`);
    }
  }

  // Lưu cache kể cả khi result=null (để không retry cho tin không phải cuốc)
  if (msgId) _cache.set(msgId, { result, ts: Date.now() });

  if (!result && lastErr) throw lastErr;
  return result;
}

export function aiToTrip(ai, raw) {
  if (!ai?.isTrip) return null;
  const price = Number(ai.price);
  if (!price || price < 50 || price > 5000) return null;

  return {
    groupId: raw.groupId,
    group: raw.groupName,
    senderId: raw.senderId,
    sender: raw.senderName,
    msgId: raw.msgId,
    t: raw.time,
    text: raw.text,
    price,
    time: {
      label: ai.timeLabel || "Linh hoạt",
      bucket: ai.timeBucket || "today",
    },
    car: ai.car || null,
    seats: ai.seats || "Không rõ",
    type: ai.type || "Ghép 1",
    route: (ai.from || ai.to) ? { from: ai.from || "?", to: ai.to || "?" } : null,
    free: !!ai.free,
    isRoundTrip: !!ai.isRoundTrip,
    explicitPoints: null,
    bonus: null,
    tripType: ai.tripType || null,
    _parsedBy: "ai",
  };
}
