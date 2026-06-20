# Trợ Lý Tài Xế AI

Hệ thống gom cuốc xe từ nhóm Zalo, tài xế xem và nhận cuốc realtime. Admin duyệt tài khoản, cấp gói. Kế toán quản lý điểm thành viên nhóm.

## Kiến trúc — 4 service độc lập

| Service | Thư mục | Port | Vai trò |
|---------|---------|------|---------|
| Driver backend | `tlx-driver-service/` | **8080** | API + WebSocket cho tài xế |
| Driver frontend | `tlx-driver/` | **5173** | UI tài xế (mobile-first) |
| Admin+KT backend | `tlx-worker/` | **8082** | API + WebSocket cho admin và kế toán |
| Admin+KT frontend | `tlx-web/` | **5174** | UI admin (`/admin`) + kế toán (`/accountant`) |

Tài xế và admin/kế toán **hoàn toàn độc lập** — nâng cấp admin không cần dừng service tài xế.  
Cả 2 backend dùng chung 1 file DB (`tlx-worker/data/tlx.db`, SQLite WAL mode).

---

## Chạy development (4 terminal)

```bash
# Terminal 1 — Driver backend
cd tlx-driver-service && npm install && npm start
# → http://localhost:8080

# Terminal 2 — Driver frontend
cd tlx-driver && npm install && npm run dev
# → http://localhost:5173

# Terminal 3 — Admin+KT backend
cd tlx-worker && npm install && npm start
# → http://localhost:8082

# Terminal 4 — Admin+KT frontend
cd tlx-web && npm install && npm run dev
# → http://localhost:5174
```

### Lần đầu: cấu hình .env

```bash
# Driver backend
cp tlx-driver-service/.env.example tlx-driver-service/.env   # PORT=8080

# Admin+KT backend
cp tlx-worker/.env.example tlx-worker/.env                   # PORT=8082
```

---

## URL truy cập

| Ai | URL |
|----|-----|
| Tài xế | http://localhost:5173 |
| Admin | http://localhost:5174/admin |
| Kế toán | http://localhost:5174/accountant |

**Tài khoản mặc định:** `admin / admin` — đổi mật khẩu ngay sau lần đăng nhập đầu tiên.

---

## Luồng sử dụng

**Tài xế:**
1. Vào `localhost:5173` → Đăng ký (SĐT + mật khẩu) → chờ admin duyệt
2. Admin duyệt → tài xế đăng nhập → quét QR Zalo (tài khoản Zalo phụ)
3. Chọn nhóm theo dõi → cuốc xe hiện realtime → nhấn "Nhận" để gửi "ok ib"

**Admin:**
1. Vào `localhost:5174/admin` → Đăng nhập
2. Duyệt tài khoản, cấp gói tuần/tháng, xem thống kê, cài đặt voice STT

**Kế toán:**
1. Vào `localhost:5173` → Đăng nhập bằng tài khoản kế toán → tự redirect sang `localhost:5174/accountant`
2. Quét QR Zalo → chọn nhóm phụ trách → xem điểm thành viên, duyệt san điểm

---

## Tính năng

- Đăng ký / đăng nhập, phân quyền 3 role: `driver` / `admin` / `accountant`
- Mỗi user một phiên Zalo riêng — cuốc/nhóm không lẫn nhau
- Gom cuốc realtime, lọc theo giờ / loại cuốc / loại xe / từ khoá
- Parser bóc giá, giờ (csct = đi ngay), tuyến đường (`>>>`, `=>>`, `->`, `→`…), số ghế (`1k`–`6k`)
- Nhận cuốc → tự gửi "ok ib" → chờ chủ xác nhận → popup "nhận được cuốc"
- Voice STT: tin nhắn voice → FPT.AI → parse cuốc (bật/tắt trong Admin)
- Kế toán: quản lý điểm thành viên, barem tính điểm, duyệt san điểm, lịch sử giao dịch

---

## Cấu hình môi trường

### `tlx-driver-service/.env`
```
PORT=8080
DATA_DIR=../tlx-worker/data   # trỏ vào cùng DB với tlx-worker
APP_SECRET=                    # bắt buộc production (mã hoá cookie Zalo)
```

### `tlx-worker/.env`
```
PORT=8082
DATA_DIR=./data
DATABASE_URL=                  # để trống = SQLite, điền = PostgreSQL
APP_SECRET=                    # bắt buộc production
FPT_STT_API_KEY=               # hoặc cấu hình qua Admin UI
CORS_ORIGIN=*
```

### `tlx-driver/.env` (nếu backend khác localhost)
```
VITE_API_BASE=http://server:8080
VITE_WS_BASE=ws://server:8080/ws
VITE_ADMIN_URL=http://server:5174
```

### `tlx-web/.env` (nếu backend khác localhost)
```
VITE_API_BASE=http://server:8082
VITE_WS_BASE=ws://server:8082/ws
```

---

## Database

- **Dev**: SQLite tại `tlx-worker/data/tlx.db` (tự tạo lần đầu)
- **Prod**: PostgreSQL — đặt `DATABASE_URL` trong `tlx-worker/.env`
- Cả 2 backend dùng chung 1 file DB, SQLite WAL mode cho phép multi-process

---

## ⚠️ Cảnh báo

- `zca-js` là thư viện **không chính thức**. Tự gửi "ok ib" là hành vi Zalo dễ phát hiện.
- Dùng **tài khoản Zalo phụ (SIM riêng)**, không dùng số chính.
- Đặt **APP_SECRET** trong `.env` trước khi lên production để mã hoá cookie Zalo trong DB.

---

## Tài liệu thêm

- **ARCHITECTURE.md** — phân tích chịu tải, scale 200 → 5000 user
- **DEPLOY.md** — hướng dẫn deploy VPS từng bước (PostgreSQL, Nginx, HTTPS, PM2)
