# tlx-worker — Backend Admin + Kế toán (port 8082)

API + WebSocket cho admin và kế toán. Không phục vụ tài xế (tài xế dùng `tlx-driver-service`).

## Chạy

```bash
cp .env.example .env   # chỉnh PORT=8082, DATABASE_URL nếu dùng PostgreSQL
npm install
npm start
```

Server lên cổng **8082**. Tài khoản admin mặc định: `admin / admin`.

## Cấu hình .env quan trọng

```
PORT=8082
DATA_DIR=./data                # SQLite tại data/tlx.db
DATABASE_URL=                  # để trống = SQLite, điền = PostgreSQL
APP_SECRET=                    # bắt buộc production (mã hoá cookie Zalo)
FPT_STT_API_KEY=               # fallback nếu chưa cấu hình qua Admin UI
CORS_ORIGIN=*                  # production: ghi đúng domain
```

## Endpoints

```
POST /api/login
POST /api/logout
GET  /api/me
POST /api/change-password
GET  /api/admin/users
POST /api/admin/approve
POST /api/admin/renew
POST /api/admin/ban
POST /api/admin/reset-password
POST /api/admin/set-role
GET  /api/admin/stats/revenue
GET  /api/admin/stats/users
GET  /api/admin/settings
POST /api/admin/settings
POST /api/zalo/login-qr        ← kế toán quét QR
POST /api/zalo/logout
GET  /api/zalo/pending-qr
GET  /api/accountant/groups
POST /api/accountant/confirm-groups
GET  /api/accountant/zalo-groups
GET  /api/accountant/members
POST /api/accountant/members
POST /api/accountant/sync-members
GET  /api/accountant/transactions
POST /api/accountant/adjust-points
PATCH /api/accountant/transactions/:id
DELETE /api/accountant/transactions/:id
GET  /api/accountant/pending-transfers
POST /api/accountant/pending-transfers/:id/approve
POST /api/accountant/pending-transfers/:id/reject
GET  /api/accountant/rules/:groupId
POST /api/accountant/rules/:groupId
GET  /health
```

## Files src/

| File | Vai trò |
|------|---------|
| `index.js` | Express + WebSocket server |
| `sessionManager.js` | Quản lý phiên Zalo (kế toán) |
| `parser.js` | Tách tin nhắn → cuốc xe |
| `dbLayer.js` | Auto-select SQLite / PostgreSQL |
| `db.js` | SQLite implementation |
| `db.pg.js` | PostgreSQL implementation |
| `stt.js` | FPT.AI Speech-to-Text |
| `config.js` | Cài đặt in-memory (voice, FPT key) |
| `crypto.js` | Mã hoá cookie Zalo (AES-256-GCM) |

## Chia sẻ DB với tlx-driver-service

Cả 2 backend dùng chung `data/tlx.db`.  
`tlx-driver-service` đặt `DATA_DIR=../tlx-worker/data` để trỏ vào đây.  
SQLite WAL mode (bật trong `db.js`) cho phép 2 process đọc/ghi đồng thời an toàn.

## Lưu ý zca-js

Field của zca-js có thể đổi giữa phiên bản. Bật `DEBUG_RAW=true` trong `.env` để log cấu trúc raw content khi debug.
