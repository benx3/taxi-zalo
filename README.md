# Trợ Lý Tài Xế AI

Hệ thống gom "cuốc xe" từ các nhóm Zalo về một màn hình, lọc theo từ khoá / khu vực /
loại cuốc, và cho tài xế nhận cuốc nhanh (tự gửi "ok ib"). Gồm 2 phần chạy song song:

```
TroLyTaiXe-AI/
├── tlx-worker/   ← Backend: zca-js đọc Zalo + API + SQLite (Node.js)
└── tlx-web/      ← Frontend: app tài xế + trang admin (React + Vite)
```

## ⚠️ Cảnh báo quan trọng
- `zca-js` là thư viện **không chính thức**. Tự động gửi tin ("ok ib") là hành vi
  Zalo **dễ phát hiện và khoá tài khoản nhất**.
- Dùng **tài khoản Zalo phụ (SIM riêng)**, không dùng số chính.
- Test quy mô nhỏ trước, theo dõi xem có bị khoá không rồi mới mở rộng.

## Chạy nhanh (2 cửa sổ terminal)

**Terminal 1 — Backend:**
```bash
cd tlx-worker
cp .env.example .env
npm install
npm start
```
Server lên cổng 8080. Tài khoản admin được tạo tự động lần đầu khởi động — **đổi mật khẩu ngay sau khi đăng nhập**.

**Terminal 2 — Frontend:**
```bash
cd tlx-web
npm install
npm run dev
```
Mở http://localhost:5173

## Luồng dùng (test 5 account)
1. Mỗi tài xế mở web → **Đăng ký** (SĐT + mật khẩu) → chờ duyệt.
2. Đăng nhập tài khoản admin → tab Admin → **Duyệt · Tuần/Tháng** cho từng người.
3. Tài xế đăng nhập lại → màn **Kết nối Zalo** → bấm "Hiện mã QR" → quét bằng
   tài khoản Zalo phụ của họ.
4. Vào màn cuốc: mỗi tài xế **chỉ thấy nhóm của chính mình** (cô lập hoàn toàn).

## Tính năng
- Đăng ký / đăng nhập, phân quyền admin vs tài xế (kiểm role ở server).
- Admin: duyệt tài khoản, cấp gói tuần/tháng, gia hạn, khoá.
- Mỗi user một phiên Zalo riêng — cuốc/nhóm không lẫn sang nhau.
- Gom cuốc realtime, lọc theo giờ / loại cuốc / loại xe / từ khoá / cuốc free.
- Parser bóc giá, giờ (kể cả csct/cnct = đi ngay), tuyến đường, loại xe.
- Chọn nhóm theo dõi (tìm theo tên nhóm).
- Nhận cuốc → tự gửi "ok ib" → theo dõi chủ xác nhận → popup "nhận được cuốc".
- Lưu cuốc đã nhận vào SQLite, giữ 2 tháng, tự xoá rác.

## Ghi chú kỹ thuật
- Backend là JavaScript thuần (ESM). Frontend React + Vite.
- DB là SQLite (1 file `tlx-worker/data/tlx.db`). Đổi sang PostgreSQL chỉ cần thay
  `tlx-worker/src/db.js`, giữ nguyên các hàm export.
- Một số field của `zca-js` (getAllGroups, getGroupInfo, sendMessage, ảnh QR,
  uidFrom/quote/mentions) có thể khác giữa phiên bản. Bật `DEBUG_RAW=true` trong
  `.env`, xem log, chỉnh trong `parser.js` / `sessionManager.js` / `index.js`.

## Trước khi lên production
- Hash mật khẩu bằng bcrypt (hiện dùng SHA-256 cho test).
- HTTPS + mã hoá cookie Zalo trong DB.
- Tách mỗi nhóm phiên zca-js ra process riêng (PM2/Docker) để cô lập lỗi.
- Cân nhắc dùng AI (Claude) bóc tách tin khó thay vì chỉ regex.

## Tài liệu thêm
- **ARCHITECTURE.md** — phân tích chịu tải, scale 200→5000 user.
- **DEPLOY.md** — hướng dẫn deploy VPS từng bước (PostgreSQL, Nginx, HTTPS, PM2).

## Database
- Dev local: tự dùng SQLite (không cần cài gì).
- Production: đặt `DATABASE_URL` trong `tlx-worker/.env` → tự chuyển PostgreSQL.
