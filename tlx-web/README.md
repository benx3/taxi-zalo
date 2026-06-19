# TLX Web — App tài xế (React + Vite)

Frontend nối backend worker đa phiên. Đăng nhập/đăng ký thật, phân quyền,
mỗi user tự quét QR Zalo, chỉ thấy nhóm của mình.

## Cài & chạy
```bash
cd tlx-web
npm install
npm run dev
```
Mở http://localhost:5173 — worker phải đang chạy ở cổng 8080.
Đổi địa chỉ backend ở đầu file `src/api.js` (BASE và WS_BASE) nếu khác máy.

## Test 5 account
- Admin: đăng nhập tài khoản admin (xem log worker lần đầu khởi động) → duyệt các tài khoản đăng ký.
- Tài xế: Đăng ký → chờ admin duyệt → đăng nhập → quét QR Zalo → vào màn cuốc.
- Token lưu ở localStorage, F5 không phải đăng nhập lại.

## File
- src/api.js — gọi HTTP API (login, register, admin, zalo QR)
- src/useWorker.js — WebSocket kèm token, nhận cuốc/QR realtime
- src/App.jsx — toàn bộ UI
