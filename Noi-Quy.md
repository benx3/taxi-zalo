# Nội Quy Đăng Cuốc Xe — Hệ Thống Tính Điểm Tự Động

> Hệ thống đọc tin nhắn và tính điểm tự động. Viết đúng format thì điểm tính đúng — viết sai thì hệ thống bỏ qua hoặc tính sai.

---

## 1. QUY TẮC VÀNG — BẮT BUỘC

### Tin đăng cuốc phải có GIÁ TIỀN
Hệ thống chỉ nhận diện cuốc xe khi tin nhắn có giá. Không có giá → không tính điểm.

| Viết đúng | Viết sai |
|---|---|
| `300k` | `ba trăm` |
| `1tr500` | `1 triệu rưỡi` |
| `1.500.000đ` | `1,5 triệu đ` |

---

## 2. FORMAT TUYẾN ĐƯỜNG

Dùng dấu `---` hoặc `>>>` để phân tách **điểm đón → điểm trả**.

```
[điểm đón] --- [điểm trả] [giá]
[điểm đón] >>> [điểm trả] [giá]
```

**Ví dụ đúng:**
```
Mỹ Đình --- Bắc Ninh 350k
Nội Bài >>> Hà Đông 400k
```

**Lưu ý:**
- Hệ thống lấy phần **cuối cùng trước dấu phân tách** làm điểm đón, phần **sau dấu phân tách** làm điểm trả
- Ghi chú thêm trong ngoặc `()` không ảnh hưởng đến điểm đón/trả: `(cần có mặt 8h) Mỹ Đình --- Bắc Ninh 350k`
- Không nhất thiết phải dùng `---`, cũng nhận: `→`, `>>`, `=>>>`

---

## 3. LOẠI CUỐC VÀ TỪ KHOÁ NHẬN DIỆN

Hệ thống tự xác định loại cuốc qua từ khoá trong tin. **Bắt buộc có từ khoá** nếu muốn tính điểm đúng barem.

### 3.1 Ghép khách

| Loại | Từ khoá | Ví dụ |
|---|---|---|
| Ghép 1 ghế | `1k` hoặc `1gh` hoặc `1ghế` (hoặc không ghi) | `Mỹ Đình --- Bắc Ninh 1k 350k` |
| Ghép 2 khách | `2k` hoặc `2gh` hoặc `2ghế` | `Mỹ Đình --- Bắc Ninh 2k 350k` |
| Ghép 3 khách | `3k` hoặc `3gh` | `Mỹ Đình --- Bắc Ninh 3k 350k` |

> Không ghi số ghế → hệ thống mặc định **Ghép 1**.

### 3.2 Bao xe

| Loại | Từ khoá |
|---|---|
| Bao xe 1 chiều | `bx`, `bxe`, `bao xe` |
| Bao xe 2 chiều | `bx 2c`, `bxe 2c`, `bao xe 2 chiều` |

**Ví dụ:**
```
bx Mỹ Đình --- Hải Phòng 900k
bao xe 2c Hà Nội --- Quảng Ninh 1tr200
```

### 3.3 Sân bay

Hệ thống nhận diện qua: `sân bay`, `T1`, `T2`, `NB`, `Nội Bài`, `sân quốc tế`, `sân quốc nội`, `bay quốc tế`, `bay quốc nội`, `hạ sân`, `hạ cánh`, `sảnh`.

| Loại | Từ khoá nhận biết chiều |
|---|---|
| **Sân bay đón** (đón khách từ sân bay về) | `hạ sân`, `hạ cánh`, `đón`, `đáp xuống`, hoặc có số hiệu chuyến + giờ hạ |
| **Sân bay tiễn** (đưa khách ra sân bay) | `tiễn`, `đưa đi` |
| **Sân bay 2 chiều** | `2c`, `2 chiều` |

**Ví dụ đúng:**
```
VJ933 dự 13h03 hạ sân quốc tế --- Đọi Sơn Duy Tiên 600k
Tiễn sân bay T1 Nội Bài --- Cầu Giấy 350k
Sân bay đón 2 chiều Nội Bài --- Hoàng Mai 700k
```

> Không ghi rõ chiều → hệ thống xếp **"Sân bay"** (kế toán có thể điều chỉnh).

### 3.4 Hàng / Ship

Từ khoá: `ship`, `gửi hàng`, `chở hàng`, `giao hàng`, `csct đồ`, `đồ` (đứng đầu), `kiện hàng`, `bao hàng`, `hàng nhỏ/nặng/lớn/gọn`.

**Ví dụ:**
```
Csct đồ 45kg gọn để cốp. Lấy KCN Quang Minh --- KCN DV1 và KCN DV3 300k
Ship hàng Cầu Giấy --- Bắc Từ Liêm 150k
```

---

## 4. THỜI GIAN

| Từ khoá | Ý nghĩa |
|---|---|
| `csct`, `cnct`, `đi ngay`, `đi luôn`, `gấp` | Đi ngay |
| `30p`, `15p` | Bao nhiêu phút nữa đi |
| `8h`, `13h30`, `6h30` | Giờ cụ thể |
| `sm`, `sáng mai`, `ngày mai`, `mai` | Ngày mai |
| Không ghi | Linh hoạt |

---

## 5. CÁCH NHẬN CUỐC (tài xế trả lời)

Trả lời tin đăng cuốc bằng:
```
ok
oke
oki
ib
```

> **Quan trọng:** Trả lời ngắn gọn, **không kèm giá tiền** (ví dụ `ok 300k` sẽ bị bỏ qua vì hệ thống nhầm là cuốc mới).

---

## 6. CÁCH XÁC NHẬN CUỐC (chủ cuốc chốt tài xế)

Chủ cuốc reply vào tin nhận cuốc của tài xế:
```
ok ib
ok.ib
okib
```

Lúc này hệ thống ghi nhận giao dịch điểm và đưa vào **chờ kế toán duyệt**.

### Thoả thuận điểm khi xác nhận

Nếu muốn tính điểm khác barem mặc định, ghi kèm điểm trong tin xác nhận:

```
ok ib 2đ
ok.ib 1.5d
ok ib +-2điểm
ok ib -+1.5đ
```

---

## 7. ĐIỂM EXPLICIT TRONG TIN ĐĂNG

Nếu chủ cuốc muốn gắn điểm cố định ngay từ tin đăng (không theo barem):

```
Mỹ Đình --- Hải Phòng 900k 2đ
Sân bay T2 --- Hà Đông 400k 1.5đ
```

Định dạng điểm hợp lệ: `1đ`, `2d`, `1.5đ`, `0,5đ`, `+-2đ`, `-+1d`, `1 diem`, `1 điểm`

---

## 8. ĐĂNG NHIỀU CUỐC TRONG 1 TIN

Tách từng cuốc thành **từng dòng riêng**, mỗi dòng có giá riêng:

```
Csct đồ 45kg. Lấy KCN Quang Minh --- KCN DV1 và DV3 300k

VJ933 dự 13h03 hạ sân quốc tế --- Đọi Sơn Duy Tiên 600k
```

> Khi tin có nhiều cuốc, hệ thống sẽ đưa vào **chờ kế toán xác nhận** để tránh tính sai điểm (vì không biết tài xế nhận cuốc nào).

---

## 9. CÁC TIN NHẮN HỆ THỐNG BỎ QUA

| Loại tin | Ví dụ | Lý do bỏ qua |
|---|---|---|
| Reply bắt đầu bằng `@` | `@Anh Nam ok` | Xem là reply thường |
| Tin hủy | `lịch hủy`, `hủy lịch` | Từ khoá hủy |
| Thông báo đã có người | `đã có người`, `đã bay` | Từ khoá đóng cuốc |
| San điểm | `sản giúp`, `san hộ` | Là giao dịch nội bộ |
| Cảm ơn | `cảm ơn`, `thank`, `dbcl` | Không phải cuốc |
| Phụ phí nghỉ | `+ 2 nghỉ 400k` | Bắt đầu bằng `+ Ngh` |

---

## 10. VÍ DỤ ĐẦY ĐỦ

### Ghép 1 ghế — đơn giản
```
Mỹ Đình --- Bắc Ninh 350k
```

### Ghép 2 khách — giờ cụ thể
```
8h 2k Hà Đông --- Sơn Tây 200k
```

### Bao xe — đi ngay
```
csct bx Long Biên --- Hải Dương 700k
```

### Sân bay đón
```
VN215 dự 14h20 hạ sân quốc tế --- Cầu Giấy 420k
```

### Sân bay tiễn
```
Tiễn sân bay T1 7h30 Đống Đa --- Nội Bài 300k
```

### Hàng — nhiều địa điểm trả
```
Csct đồ 45kg gọn để cốp. Lấy KCN Quang Minh ---- trả KCN DV1 và KCN DV3 300k
```

### Điểm thoả thuận trong tin xác nhận
```
[Tài xế]: ok
[Chủ cuốc reply vào tin tài xế]: ok.ib 2đ
```

---

## 11. TÓM TẮT NHANH

```
[thời gian] [số ghế/loại xe] [điểm đón] --- [điểm trả] [giá] [điểm nếu có]
```

- **Bắt buộc:** giá (`300k`, `1tr2`)
- **Phân tách tuyến:** `---` hoặc `>>>`
- **Nhận cuốc:** `ok` / `ib` (ngắn, không kèm giá)
- **Chốt cuốc:** `ok ib` (chủ cuốc reply vào tin nhận của tài xế)
