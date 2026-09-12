# HƯỚNG DẪN ĐĂNG & NHẬN CUỐC XE
### Dành cho tài xế trong nhóm — Hệ thống tính điểm tự động

> **Đọc 2 phút, nhớ 3 điều:**
>
> **1.** Đăng cuốc phải có **giá tiền** — **2.** Nhận cuốc chỉ gõ **ok** (thật ngắn) — **3.** Chủ cuốc chốt bằng **ok ib**
>
> Hệ thống đọc tin nhắn trong nhóm và tự tính điểm. Viết đúng thì điểm vào đúng. Viết sai thì hệ thống không hiểu, điểm không được tính — mất công cả nhà.

---

## BẢNG TRA NHANH

| Việc cần làm | Gõ thế nào | Ví dụ |
|---|---|---|
| Đăng cuốc | [giờ] [loại] [điểm đón] >> [điểm đến] [giá] | `19h 1k Mỹ Đình >> Bắc Ninh 350k` |
| Nhận cuốc | Reply tin đăng, gõ ok | `ok` |
| Nhận kèm thỏa thuận điểm | ok [số]đ | `ok 1.5đ` |
| Chủ cuốc chốt tài xế | Reply tin nhận, gõ ok ib | `ok ib` |
| Chủ cuốc chốt kèm điểm | ok ib [số]đ | `ok ib 2đ` |
| Cho điểm người khác | san @[tên] [số]đ | `san @Tuấn 5đ` |
| Nhờ kế toán xem lại | Tag @kế toán + nói rõ việc | `@kế toán cuốc này tính nhầm` |

---

# PHẦN 1 — ĐĂNG CUỐC

## 1.1. Bắt buộc phải có giá tiền

Không có giá thì hệ thống **không coi là cuốc xe**.

| Viết được | Không nhận |
|---|---|
| `350k` | ba trăm rưỡi |
| `1tr500` hoặc `1tr5` | 1 triệu rưỡi |
| `1.500.000đ` | giá thỏa thuận |

## 1.2. Dấu phân tách tuyến đường

Ngăn **điểm đón** và **điểm đến** bằng một trong các dấu sau — dùng dấu nào cũng được:

    >>      >>>      -->      --->      ->      →      ...

Hoặc dùng chữ: **về · lên · đi · ra · sang**

Ví dụ:

    Mỹ Đình >> Bắc Ninh 350k
    Nội Bài --> Hà Đông 400k
    Phủ Lý về Hà Nội 500k

## 1.3. Ghi rõ loại cuốc

Không ghi loại thì hệ thống mặc định là **Ghép 1 khách** — dễ tính thiếu điểm.

### Ghép khách

| Loại | Gõ | Ví dụ |
|---|---|---|
| Ghép 1 khách | `1k` | `19h 1k Mỹ Đình >> Bắc Ninh 350k` |
| Ghép 2 khách | `2k` | `19h 2k Mỹ Đình >> Bắc Ninh 350k` |
| Ghép 3 khách | `3k` | `19h 3k Mỹ Đình >> Bắc Ninh 350k` |

### Bao xe

| Loại | Gõ | Ví dụ |
|---|---|---|
| Bao xe | `bao xe`, `bx`, `bxe`, `bx7` | `20h bx7 Hà Nội >> Hải Phòng 900k` |
| Bao xe 2 chiều | thêm `2c` | `bx 2c Hà Nội >> Quảng Ninh 1tr2` |

> ### LƯU Ý QUAN TRỌNG VỀ CHỮ "bx"
>
> Chữ **bx** có 2 nghĩa: **bao xe** và **bến xe**. Hệ thống phân biệt như sau:
>
> **bx + 5 bến xe này = BẾN XE** (không tính bao xe):
> **Mỹ Đình · Giáp Bát · Nước Ngầm · Gia Lâm · Yên Nghĩa**
>
> **bx + bất kỳ chỗ nào khác = BAO XE**

| Bạn gõ | Hệ thống hiểu |
|---|---|
| `bx Mỹ Đình >> Bắc Ninh 300k` | Bến xe Mỹ Đình (ghép) |
| `bx Giáp Bát >> Nam Định 250k` | Bến xe Giáp Bát (ghép) |
| `bx Đồng Văn >> Hà Nội 400k` | **Bao xe** |
| `bx7 Hà Nội >> Hải Phòng 900k` | **Bao xe** (có số = bao xe) |

> **Muốn chắc chắn thì gõ đủ chữ: "bao xe" hoặc "bến xe".**

### Sân bay

Hệ thống nhận ra qua: sân bay, Nội Bài, NB, T1, T2, sảnh, hạ cánh, hạ sân.

| Loại | Gõ thêm | Ví dụ |
|---|---|---|
| Sân bay **đón** (từ sân bay về) | đón, hạ sân, hạ cánh | `VJ933 13h hạ sân T2 >> Duy Tiên 600k` |
| Sân bay **tiễn** (đưa ra sân bay) | tiễn, đưa đi | `Tiễn T1 Nội Bài >> Cầu Giấy 350k` |
| Sân bay **2 chiều** | 2c | `Đón 2c Nội Bài >> Hoàng Mai 700k` |

### Hàng / Ship

Từ khóa: ship, gửi hàng, chở hàng, giao hàng, bao hàng, kiện hàng.

    Ship hàng Cầu Giấy >> Bắc Từ Liêm 150k
    Csct đồ 45kg gọn để cốp. KCN Quang Minh >> KCN DV1 300k

## 1.4. Ghi giờ

| Gõ | Nghĩa |
|---|---|
| `8h`, `13h30` | Giờ cụ thể |
| `csct`, `đi ngay`, `gấp` | Đi ngay |
| `30p` | 30 phút nữa |
| `sm`, `sáng mai`, `mai` | Ngày mai |

## 1.5. Muốn tự đặt điểm thay vì theo barem

Ghi số điểm ngay trong tin đăng:

    Mỹ Đình >> Hải Phòng 900k 2đ
    Sân bay T2 >> Hà Đông 400k 1.5đ

## 1.6. Đăng nhiều cuốc trong 1 tin

Mỗi cuốc **một dòng riêng**, mỗi dòng có giá riêng:

    19h 1k Mỹ Đình >> Bắc Ninh 350k

    20h bao xe Hà Nội >> Hải Phòng 900k

> Tin nhiều cuốc sẽ được đưa vào **chờ kế toán duyệt** (vì máy không biết tài xế nhận cuốc nào).

---

# PHẦN 2 — NHẬN CUỐC

## 2.1. Cách nhận

**Reply (trả lời) vào đúng tin đăng cuốc**, rồi gõ một trong các chữ sau:

    ok        oke        oki        ib

> ## QUY TẮC QUAN TRỌNG NHẤT KHI NHẬN CUỐC
>
> ### Tin nhận cuốc phải NGẮN — dưới 25 ký tự
>
> Viết dài là hệ thống **không hiểu đó là nhận cuốc**, và **bạn mất điểm** mà không ai biết.

| Nhận được | MẤT ĐIỂM |
|---|---|
| `ok` | ok anh nhé em nhận cuốc này |
| `ok 1.5đ` | ok Lịch tín 1.5đ. @kế toán lưu ý giúp |
| `oke 2d` | ok để em sắp xếp xe rồi báo lại sau |
| `ib` | ok bác ơi em đang ở gần đó |

> **Muốn nói thêm gì thì gõ ok trước, rồi nhắn tin thứ hai riêng:**

    Tin 1:  ok
    Tin 2:  Anh cho em xin số khách với ạ

## 2.2. Không được ghi giá tiền khi nhận

`ok 300k` bị hiểu là **đăng cuốc mới**, không phải nhận cuốc.

## 2.3. Nhận kèm thỏa thuận điểm

Nếu đã thống nhất điểm khác với barem:

    ok 1đ
    oke 1.5đ
    ok 0,5đ
    ib -+0,5đ

> **Nhớ có dấu cách giữa "ok" và số.** Gõ dính `ok1.5đ` thì hệ thống **không đọc được số điểm**.

---

# PHẦN 3 — CHỦ CUỐC CHỐT TÀI XẾ

## 3.1. Cách chốt

**Reply vào đúng tin nhận cuốc của tài xế**, rồi gõ:

    ok ib       okib       oki ib       ok.ib

Lúc này hệ thống mới ghi nhận điểm.

## 3.2. Chốt kèm điểm khác

    ok ib 2đ
    okib 1.5d
    ok ib +-2điểm

> **Nhớ có dấu cách trước số.** Gõ `okib1.5` thì vẫn chốt được cuốc nhưng **số 1.5 bị bỏ qua**, hệ thống tính theo barem.

## 3.3. Cuốc miễn phí (không tính điểm)

    ok ib free

## 3.4. Thứ tự ưu tiên điểm

| Ưu tiên | Nguồn | Ví dụ |
|---|---|---|
| 1 — cao nhất | Điểm trong tin chốt của chủ cuốc | `ok ib 2đ` |
| 2 | Điểm trong tin nhận của tài xế | `ok 1.5đ` |
| 3 | Điểm ghi trong tin đăng cuốc | `... 350k 1đ` |
| 4 — thấp nhất | Barem tự động | (không ghi gì) |

---

# PHẦN 4 — SAN ĐIỂM (cho / chuyển điểm)

## 4.1. Cho điểm người khác

    san @Tuấn 5đ

Cho nhiều người cùng lúc — **ghi rõ số điểm ngay sau mỗi tên**:

    san @Tuấn 2đ @Hùng 3đ @Minh 1.5đ

## 4.2. Trả điểm cho kế toán

    san @kế toán 40đ

## 4.3. Quy tắc san điểm

| Quy tắc | Chi tiết |
|---|---|
| Tối đa | **200đ** mỗi lần |
| Bắt buộc | Phải có đơn vị **đ** hoặc **d** sau số |
| Bắt buộc | Số điểm ghi **ngay sau tên người nhận** |
| Kết quả | Vào **chờ kế toán duyệt**, không trừ/cộng ngay |

| Đúng | Sai |
|---|---|
| `san @Tuấn 5đ` | `san @Tuấn 5` (thiếu chữ đ) |
| `san @Tuấn 2đ @Hùng 3đ` | `san 2đ cho @Tuấn` (số đứng trước tên) |
| `san @Tuấn 100đ` | `san @Tuấn 500đ` (quá 200đ) |

---

# PHẦN 5 — NHỜ KẾ TOÁN XỬ LÝ

## 5.1. Các lệnh với kế toán

**Reply vào tin cuốc cần sửa**, tag @kế toán kèm lệnh:

| Việc | Gõ | Ví dụ |
|---|---|---|
| Hủy cuốc, hoàn điểm | lịch hủy | `lịch hủy @kế toán` |
| Cuốc miễn phí | lịch free | `lịch free @kế toán` |
| Sửa lại số điểm | lịch [số] | `lịch 2đ @kế toán` |

> Sửa điểm 1 cuốc tối đa **20đ**.

## 5.2. Tag kế toán để nhờ xem lại

Nếu có tranh chấp, thắc mắc, hoặc bất kỳ việc gì cần kế toán — **cứ tag @kế toán và nói rõ**:

    @kế toán cuốc này em với anh Tuấn thỏa thuận 2đ mà máy tính 1đ

> **Yên tâm:** mọi tin có tag @kế toán đều được đưa vào danh sách **chờ kế toán xem**, kể cả khi máy không hiểu bạn muốn gì. Kế toán sẽ đọc và xử lý tay. Không bị trôi mất.

---

# PHẦN 6 — LỖI THƯỜNG GẶP

| Tình huống | Hậu quả | Cách sửa |
|---|---|---|
| Đăng cuốc quên giá | Không tính là cuốc xe | Luôn ghi giá: `350k` |
| Nhận cuốc viết dài dòng | **Mất điểm**, không ai biết | Gõ `ok` thôi, nói thêm ở tin sau |
| Nhận cuốc ghi giá `ok 300k` | Bị hiểu là cuốc mới | Chỉ ghi điểm: `ok 1đ` |
| Gõ dính `ok1.5đ` hoặc `okib1.5` | Số điểm bị bỏ qua | Thêm dấu cách: `ok 1.5đ` |
| Không reply mà gõ `ok` riêng | Máy không biết nhận cuốc nào | Phải **reply đúng tin** đăng cuốc |
| Chủ cuốc tự `ok ib` tin của mình | Không tính điểm | Phải reply tin **của tài xế nhận** |
| `san @Tuấn 5` thiếu chữ đ | Không nhận được lệnh | `san @Tuấn 5đ` |
| San quá 200đ | Không nhận được lệnh | Chia nhiều lần |

---

# GHI NHỚ CUỐI CÙNG

> ### 3 câu thần chú
>
> **Đăng cuốc** — nhớ **giá tiền** và **loại cuốc**
>
> **Nhận cuốc** — reply đúng tin, gõ **ok** thật ngắn
>
> **Chốt cuốc** — reply tin tài xế, gõ **ok ib**
>
> Có gì thắc mắc — tag **@kế toán** và nói rõ. Luôn có người xem.
