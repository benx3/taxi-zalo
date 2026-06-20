# tlx-web — Frontend Admin + Kế toán (port 5174)

UI cho admin (`/admin`) và kế toán (`/accountant`). Kết nối backend `tlx-worker` (port 8082).

## Chạy

```bash
npm install
npm run dev
# → http://localhost:5174
```

`tlx-worker` phải đang chạy ở port 8082.

## URL

| Ai | URL |
|----|-----|
| Admin | http://localhost:5174/admin |
| Kế toán | http://localhost:5174/accountant |

Tài xế truy cập `tlx-driver` (port 5173), không phải app này.

## Cấu hình .env (nếu backend khác localhost)

```
VITE_API_BASE=http://server:8082
VITE_WS_BASE=ws://server:8082/ws
```

## Cấu trúc src/

```
src/
  App.jsx               — Admin UI (AdminLoginScreen + AdminApp)
  main.jsx              — Route dispatcher: /accountant → AccountantApp, else App
  api.js                — HTTP client, BASE=http://localhost:8082
  accountant/
    App.jsx             — Entry kế toán (login + token từ hash + role check)
    AccountantApp.jsx   — Layout kế toán (tabs: Thành viên/Giao dịch/Chờ duyệt/Barem/TK)
    api.js              — HTTP client kế toán, BASE=http://localhost:8082
    useAccountantWorker.js — WebSocket hook
    MembersTab.jsx
    TransactionsTab.jsx
    PendingTab.jsx
    BaremTab.jsx
```

## Redirect flow (khi tài xế login nhầm)

Nếu tài khoản kế toán đăng nhập vào `tlx-driver` (port 5173), app tự redirect sang:
```
http://localhost:5174/accountant#token=xxx
```
`tlx-web/src/accountant/App.jsx` đọc token từ URL hash, set vào localStorage, xoá hash, load AccountantApp.

## Build production

```bash
npm run build   # tạo dist/
```

Nginx phục vụ `dist/` như static files. Xem `DEPLOY.md` để biết cấu hình Nginx đầy đủ.
