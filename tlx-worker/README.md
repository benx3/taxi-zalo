# TLX Worker — đa phiên (SQLite + zca-js)

Server đa phiên: mỗi user tự quét QR Zalo của mình, chỉ thấy nhóm của chính mình.
Cuốc đã nhận lưu SQLite (giữ 2 tháng, tự xoá). Admin duyệt/cấp gói.

## ⚠️ Cảnh báo
zca-js không chính thức + tự gửi "ok ib" → rủi ro khoá. Dùng tài khoản phụ.

## Cài & chạy
```bash
cd tlx-worker
cp .env.example .env
npm install
npm start
```
Server lên ở cổng 8080 (HTTP API + WebSocket /ws). Admin mặc định: **admin / admin**.

## Luồng test 5 account
1. Mỗi tài xế mở web → **Đăng ký** (SĐT + mật khẩu) → trạng thái chờ duyệt.
2. Đăng nhập **admin/admin** ở web → tab Admin → **Duyệt · Tuần/Tháng** cho từng người.
3. Tài xế đăng nhập lại → màn **Kết nối Zalo** → bấm "Hiện mã QR" → quét bằng Zalo phụ của họ.
4. Vào màn cuốc: chỉ thấy nhóm của tài khoản Zalo vừa quét. Cô lập hoàn toàn giữa 5 user.

## Cô lập & bảo mật
- Mỗi WebSocket kèm token → worker chỉ đẩy cuốc của đúng user đó.
- Mỗi user một phiên zca-js riêng (sessionManager) — cuốc/nhóm không lẫn sang nhau.
- API admin luôn kiểm role ở server (không tin frontend).
- Mật khẩu hash SHA-256 (test). Production nên dùng bcrypt + HTTPS + mã hoá cookie Zalo.

## Lưu trữ
- Cuốc CHƯA nhận = rác, chỉ ở RAM, tự trôi (không lưu DB).
- Cuốc ĐÃ nhận → bảng saved_trips, giữ 2 tháng, cron xoá mỗi 6h.
- File DB: data/tlx.db (SQLite). Đổi sang PostgreSQL: chỉ thay src/db.js.

## Lưu ý zca-js
Tên hàm getAllGroups/getGroupInfo/sendMessage và field tin (uidFrom, quote, mentions,
content.image của QR) có thể khác giữa phiên bản. Bật DEBUG_RAW, xem log, chỉnh
trong parser.js / sessionManager.js cho khớp. Phần lấy ảnh QR ở index.js (ev.data.image)
cũng có thể cần đổi field tuỳ phiên bản.
