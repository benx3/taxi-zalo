# Đặc tả tính năng: Màn hình Kế toán (Accounting) & Hệ thống tính điểm

> Tài liệu dành cho Claude trong VS Code triển khai. Đọc kỹ toàn bộ trước khi code.
> Dự án nền: **Trợ Lý Tài Xế AI** (worker Node.js + zca-js, web React/Vite, DB SQLite/PostgreSQL).

---

## 1. Bối cảnh & mục tiêu

Trong mỗi nhóm cuốc xe có một hoặc vài **kế toán**. Nhiệm vụ: theo dõi tin nhắn trong
nhóm để biết **ai đăng cuốc** và **ai nhận chạy cuốc đó**, rồi **cộng/trừ điểm** tự động
theo biểu điểm (barem) riêng của nhóm.

Cơ chế điểm: khi thành viên A đăng một cuốc và thành viên B nhận chạy, thì
**A được cộng điểm, B bị trừ điểm** (số điểm tính theo giá trị cuốc và loại cuốc, dựa
trên barem của nhóm). Điểm là "tiền nội bộ" để giao dịch; hết điểm phải mua thêm từ kế
toán. Kế toán có quyền chỉnh điểm thủ công cho bất kỳ thành viên nào.

---

## 2. Vai trò mới: Kế toán (`accountant`)

Hiện hệ thống có 2 vai trò: `driver` và `admin`. Cần thêm vai trò thứ ba: **`accountant`**.

- Admin là người cấp vai trò kế toán cho một tài khoản (mở rộng tính năng "set-role" đã
  có: hiện cho phép admin/driver, nay thêm accountant).
- Một kế toán được gán phụ trách **một hoặc nhiều nhóm cụ thể** (không phải tất cả nhóm).
  Cần bảng ánh xạ kế toán ↔ nhóm.
- Kế toán đăng nhập sẽ thấy **màn hình Kế toán riêng** (khác màn tài xế và màn admin),
  tương tự cách `AdminApp` tách khỏi `DriverApp` hiện tại.

---

## 3. Mô hình dữ liệu (thêm vào database)

Thiết kế cho **cả SQLite (dev) và PostgreSQL (prod)**, giữ cùng interface như các bảng
hiện có (xem `db.js` và `db.pg.js`).

### Bảng `members` — thành viên trong nhóm
> Khác với `users` (tài khoản đăng nhập app). `members` là người tham gia nhóm Zalo.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | text PK | khóa chính nội bộ |
| `group_id` | text | thuộc nhóm nào |
| `zalo_uid` | text | **ID Zalo — ĐỊNH DANH CHÍNH** (tên có thể trùng) |
| `phone` | text | số điện thoại (có thể trống) |
| `display_name` | text | tên hiển thị (có thể trùng, chỉ để xem) |
| `points` | real | số điểm hiện tại (số thực, có 0.5) |
| `created_at` | bigint | |
| `updated_at` | bigint | |

Ràng buộc duy nhất: `(group_id, zalo_uid)` — mỗi người một bản ghi trong mỗi nhóm.

### Bảng `point_rules` — biểu điểm (barem) của từng nhóm
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `group_id` | text PK | mỗi nhóm một barem |
| `rules_json` | text | cấu hình barem dạng JSON có cấu trúc (xem mục 5) |
| `raw_text` | text | nguyên văn barem gốc (để kế toán đối chiếu) |
| `updated_at` | bigint | |

### Bảng `point_transactions` — lịch sử cộng/trừ điểm
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | text PK | |
| `group_id` | text | |
| `trip_msg_id` | text | cuốc liên quan (nếu có) |
| `from_member` | text | zalo_uid người đăng — được CỘNG |
| `to_member` | text | zalo_uid người nhận — bị TRỪ |
| `points` | real | số điểm của giao dịch |
| `reason` | text | mô tả ("Bao xe 500k", "Kế toán chỉnh tay"…) |
| `type` | text | `auto` (tự tính) hoặc `manual` (kế toán sửa) |
| `created_at` | bigint | |

---

## 4. Luồng tự động tính điểm (phần lõi, KHÓ NHẤT)

Kế toán được thêm vào nhóm Zalo (qua tài khoản Zalo của kế toán, dùng cơ chế phiên zca-js
hiện có). Worker theo dõi tin nhắn nhóm và nhận diện **chuỗi sự kiện một cuốc**:

1. **Phát hiện cuốc được đăng** — dùng `parseTrip()` sẵn có. Khi có cuốc mới, ghi nhận:
   người đăng (`zalo_uid` của người gửi tin), giá tiền, loại cuốc (bao xe/ghép/ship/sân
   bay), nội dung. Lưu tạm vào "cuốc đang chờ nhận" (pending claims) theo nhóm.

2. **Phát hiện cuốc được nhận** — phần cần quan sát chat thật:
   - Theo flow đã làm: ai đó **reply "Ok"/"ok ib" vào tin cuốc gốc**, rồi **chủ cuốc xác
     nhận** (tag lại người nhận với "ok ib") → cuốc được chốt. Người reply là
     **người nhận (B)**, người đăng là **A**.
   - Xác định cặp (A = người đăng, B = người nhận) từ chuỗi: tin cuốc gốc → tin reply →
     tin xác nhận của chủ.
   - **QUAN TRỌNG:** logic này PHẢI kiểm chứng trên dữ liệu chat thật. Mỗi nhóm có quy ước
     xác nhận khác nhau. Bật `DEBUG_RAW`, thu thập đoạn chat thật có đủ chuỗi
     đăng→nhận→xác nhận, rồi xây + tinh chỉnh. **KHÔNG giả định một quy ước cứng.**

3. **Tính điểm** — khi đã xác định cuốc chốt + giá + loại, tra **barem của nhóm đó**
   (`point_rules`) để ra số điểm. Tạo `point_transaction`: cộng điểm cho A, trừ điểm cho
   B, cập nhật `members.points` của cả hai.

4. **Thông báo** — đẩy realtime về màn kế toán để thấy giao dịch vừa tính (và sửa nếu sai).

---

## 5. Cấu hình barem (biểu điểm) cho từng nhóm

**Mỗi nhóm có barem riêng**, kế toán phải cấu hình được. Từ 2 ví dụ thật (xem Phụ lục A),
barem có cấu trúc chung:

**Mỗi quy tắc gồm:**
- **Loại cuốc:** bao xe / lịch city / ghép 1 khách / ghép 2 khách / ship / đón sân bay /
  tiễn sân bay / sân bay 2 chiều / lịch tỉnh 1 chiều / lịch tỉnh 2 chiều…
- **Khoảng giá:** từ X đến Y (vd 400k–499k)
- **Số điểm:** giá trị ± (vd 1₫, 1.5₫, 2₫)
- **Điều kiện/ghi chú đặc biệt:** một số có điều kiện phụ (vd "ghép 2 khách đón trả 1
  điểm, đón hoặc trả 2 điểm ±0.5"; "lịch tỉnh dưới 200k = 0 điểm").

**Gợi ý cấu trúc `rules_json`:**
```json
{
  "rules": [
    { "type": "bao_xe",  "min": 400, "max": 499,  "points": 1.0, "note": "" },
    { "type": "bao_xe",  "min": 500, "max": 599,  "points": 1.5, "note": "" },
    { "type": "ghep_1",  "min": 200, "max": 299,  "points": 0.5, "note": "" },
    { "type": "ship",    "min": 150, "max": 200,  "points": 0.5, "note": "" },
    { "type": "san_bay_don", "min": 250, "max": null, "points": 1.0, "note": "đón" }
  ],
  "fallback": "Vượt khung tính theo lịch tỉnh"
}
```

**Giao diện cấu hình barem (cho kế toán):**
- Bảng các quy tắc, mỗi dòng: `[Loại cuốc] [Giá từ] [Giá đến] [Số điểm]`. Thêm/sửa/xóa.
- Nút thêm quy tắc mới.
- Vùng nhập "ghi chú barem" (raw text) để lưu nguyên văn quy ước phức tạp mà bảng không
  biểu diễn hết (quy định chờ, phụ phí, lưu đêm…). Lưu vào `raw_text`.
- Lưu thành `rules_json`.

**LƯU Ý THIẾT KẾ:** barem rất phức tạp và nhiều ngoại lệ (xem ví dụ Hà Đanh Đá — hàng
chục điều kiện về phụ phí, giờ chờ, lưu đêm). **KHÔNG cố tự động hóa 100%.** Hệ thống nên:
- Tự tính được **phần lõi**: loại cuốc + khoảng giá → điểm cơ bản.
- Để kế toán **chỉnh tay dễ dàng** cho ca đặc biệt (phụ phí, ngoại lệ).
- Đây là công cụ **hỗ trợ kế toán**, không thay thế hoàn toàn.

---

## 6. Màn hình Kế toán (giao diện)

Dùng bottom-nav giống màn tài xế (xem `DriverApp`/`BottomNav` hiện có). Các tab:

**Tab "Thành viên"** — danh sách thành viên (các) nhóm kế toán phụ trách:
- Hiển thị: tên hiển thị, ID Zalo (định danh), SĐT, **số điểm hiện tại**.
- Tìm kiếm theo tên/SĐT/ID (giống tìm user của admin đã làm).
- Bấm vào một thành viên → xem **lịch sử giao dịch điểm** của họ (giống trang
  hanauda.online: click tên ra lịch sử để biết vì sao có số điểm đó).
- Nút **chỉnh điểm thủ công**: nhập số điểm cộng/trừ + lý do → tạo transaction `manual`,
  cập nhật điểm. (Cách "bán điểm" khi thành viên hết điểm.)

**Tab "Giao dịch"** — dòng thời gian giao dịch điểm tự động + thủ công gần đây:
- Mỗi dòng: `A (+điểm) ← [cuốc gì] ← B (−điểm)`, thời gian, lý do.
- Kế toán **sửa hoặc hủy** một giao dịch tự động nếu hệ thống tính sai.

**Tab "Barem"** — cấu hình biểu điểm của nhóm (mục 5).

**Tab "Tài khoản"** — như tài xế: đổi mật khẩu, đổi Zalo, đăng xuất.

Nếu kế toán phụ trách nhiều nhóm: thêm **bộ chọn nhóm** ở đầu màn hình để chuyển qua lại.

---

## 7. Phân quyền & API

- Admin cấp vai trò `accountant` và gán nhóm phụ trách cho kế toán.
- Mọi API kế toán phải kiểm tra **ở server**: người gọi có vai trò `accountant` (hoặc
  `admin`) **và** có quyền trên nhóm đó (kế toán chỉ thao tác trên nhóm mình phụ trách).
  Không tin frontend — giống `requireAdmin` đã làm.
- API cần có (tối thiểu):
  - lấy danh sách thành viên theo nhóm
  - lấy lịch sử giao dịch của một thành viên
  - chỉnh điểm thủ công (cộng/trừ + lý do)
  - lấy / lưu barem
  - sửa / hủy một giao dịch
  - (admin) gán nhóm phụ trách cho kế toán

---

## 8. Những điểm CẦN ĐẶC BIỆT LƯU Ý

1. **Định danh bằng `zalo_uid`, KHÔNG bằng tên** — tên hiển thị trùng nhau được, mọi tra
   cứu/cộng trừ điểm phải theo `zalo_uid`.

2. **Logic "ai nhận cuốc của ai" là phần rủi ro nhất** — phải xây trên dữ liệu chat thật,
   không giả định. Thu thập mẫu chat có đủ chuỗi đăng → reply → xác nhận, kiểm chứng kỹ.
   Sai chỗ này thì cộng/trừ điểm sai người — hậu quả nghiêm trọng vì điểm là "tiền".
   **Khuyến nghị: giai đoạn đầu cho hệ thống ĐỀ XUẤT giao dịch, kế toán DUYỆT trước khi
   áp dụng**, cho tới khi logic đủ tin cậy mới chuyển tự động hoàn toàn.

3. **Barem KHÔNG tự động hóa 100%** — tự tính phần lõi (loại + giá → điểm), để kế toán
   chỉnh tay phần ngoại lệ. Đừng cố nhồi mọi quy định phức tạp vào code.

4. **Mỗi nhóm một barem riêng** — không dùng chung công thức. Tra điểm theo đúng nhóm của
   cuốc.

5. **Tái dùng hạ tầng sẵn có** — `parseTrip` (nhận diện cuốc, giá, loại); phiên zca-js +
   listener (theo dõi nhóm); cơ chế role + `requireAdmin` (phân quyền); bottom-nav + tab
   của tài xế (dựng màn kế toán). Không làm lại từ đầu.

6. **Điểm là số thực** (có 0.5) — dùng kiểu số thực, cẩn thận làm tròn.

7. **Phân loại cuốc cho barem** — cần map output của `parseTrip` (type: Bao xe / Ghép 1 /
   Ghép 2 / Hàng / Sân bay) sang loại trong barem. Một số barem phân biệt thêm
   "lịch tỉnh 1 chiều / 2 chiều", "đón / tiễn sân bay" — có thể cần bổ sung nhận diện
   trong parser hoặc để kế toán chọn tay khi mơ hồ.

---

## 9. Lộ trình triển khai đề xuất

Tính năng lớn, nên chia giai đoạn:

1. **Giai đoạn 1:** thêm vai trò `accountant` + bảng `members` + màn hình xem/chỉnh điểm
   **thủ công** (kế toán tự nhập). Hữu ích ngay, ít rủi ro.
2. **Giai đoạn 2:** cấu hình barem + tự động **đề xuất** điểm khi phát hiện cuốc được chốt
   (kế toán duyệt).
3. **Giai đoạn 3:** tự động hóa hoàn toàn phần lõi sau khi logic nhận diện đã đáng tin cậy
   qua thực tế.

---

## Phụ lục A — Hai ví dụ barem thật (để tham khảo cấu trúc)

### A.1 — Nhóm "HÀ NAM SEDAN PRO 1-1"

**LỊCH BAO XE TÍNH ĐIỂM**
- Lịch City 200k–399k: ± 0.5₫
- Bao xe 400k–499k: ± 1₫
- Bao xe 500k–599k: ± 1.5₫
- Bao xe 600k–699k: ± 2₫
- Bao xe 700k–799k: ± 2.5₫
- Bao xe 800k–899k: ± 3₫
- Bao xe 900k–999k: ± 3.5₫
- Bao xe 1000k–1199k: ± 4₫
- Bao xe 1200k trở lên: ± 4.5₫

**LỊCH KHÁCH GHÉP**
- Ghép 1 khách 200k–299k: ± 0.5₫
- Ghép 1 khách 300k–499k: ± 1₫
- Ghép 1 khách từ 500k: ± 1.5₫
- Ghép 2 khách 300k: ± 0.5₫ (đón trả 1 điểm)
- Ghép 2 khách 350k: ± 1₫ (đón trả 1 điểm, đón hoặc trả 2 điểm ± 0.5)
- Ghép 2 khách 400k–499k: ± 1₫
- Ghép 2 khách 500k–599k: ± 1.5₫
- Ghép 2 khách 600k: + 2đ

**LỊCH GỬI HÀNG (SHIP)**
- Ship 150k–200k: ± 0.5₫
- Ship 250k–350k: ± 1₫
- Ship 400k–550k: ± 1.5₫
- Ship bao xe: tính theo lịch khách

**ĐÓN TIỄN SÂN BAY ↔ HÀ NỘI**
- Đón sân bay từ 250k: ± 1₫
- Tiễn sân bay 200k–250k: ± 1₫
- Đón/Tiễn trên 250k đến dưới 300k: ± 1.5đ
- Đón/Tiễn từ 300k trở lên: ± 2đ
- Hà Nội đi sân bay 2 chiều dưới 450k: ± 1đ
- Hà Nội đi sân bay 2 chiều từ 450k: ± 1.5₫
- Hà Nội đi sân bay 2 chiều từ 500k: ± 2₫

Ghi chú: áp dụng mọi khung giờ, đã gồm phí cầu đường + vé sân bay, chưa VAT. Đón/tiễn
ngoài sân bay 3km vẫn tính như sân bay. Vượt khung tính theo lịch tỉnh. Room mua từ 10đ
trở lên.

### A.2 — Nhóm "Xe Hà Đanh Đá" (Return)

- **0 điểm:** lịch tỉnh/đi phố dưới 200k.
- **0.5 điểm:** lịch tỉnh/đi phố 200k–dưới 300k; tiễn từ 250k trở xuống.
- **1 điểm:** một chiều tiễn trên 250k; tỉnh 1 chiều 300k–dưới 700k; tỉnh 2 chiều
  300k–dưới 600k.
- **1.5 điểm:** tỉnh 1 chiều 700k–dưới 900k; tỉnh 2 chiều 600k–dưới 800k.
- **2 điểm:** tỉnh 1 chiều 900k–dưới 1200k; tỉnh 2 chiều (sân bay) 800k–dưới 1100k.
- **2.5 điểm:** tỉnh 1 chiều 1200k–dưới 1400k; tỉnh 2 chiều 1100k–dưới 1400k.
- **3 điểm:** tỉnh 1400k–dưới 1800k.
- **3.5 điểm:** tỉnh 1800k–dưới 2000k.
- Ngoài barem / xe 16 chỗ trở lên / trên 2 triệu: chủ lịch ghi ±.

Ghi chú phức tạp (giữ dạng raw_text, kế toán xử lý tay): giá gầm cao mặc định giá 7c; quy
định phát hiện ảo phạt 1đ; phụ phí giờ chờ sân bay (sau 1.5h chờ tính 50k/h); bê biển auto
bồng đèn 100k; lưu đêm 5c/7c 700k, 16c 1tr; các mức phụ phí chờ tiễn sân bay theo phút;
v.v. **Những quy định này quá đa dạng để tự động hóa — lưu raw_text, kế toán chỉnh tay.**

---

## Phụ lục B — Tham chiếu trang điểm thực tế

Trang ví dụ: `https://hanauda.online/room-ht1.html`
- Hiển thị bảng thống kê điểm thành viên, tổng kết đến 23h59 hàng ngày.
- Click vào tên thành viên → xem lịch sử giao dịch (để biết vì sao có số điểm đó).
- Đây là tham chiếu cho **Tab "Thành viên"** và tính năng xem lịch sử điểm.
