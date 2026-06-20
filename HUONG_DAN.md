# Trợ Lý Tài Xế AI — Hướng dẫn vận hành

## Kiến trúc

| Service | Thư mục | Port | Vai trò |
|---------|---------|------|---------|
| Driver backend | `tlx-driver-service/` | **8080** | API + WS cho tài xế |
| Driver frontend | `tlx-driver/` | **5173** | UI tài xế (mobile) |
| Admin+KT backend | `tlx-worker/` | **8082** | API + WS cho admin và kế toán |
| Admin+KT frontend | `tlx-web/` | **5174** | UI admin (PC) + kế toán |

Tài xế và admin/kế toán **hoàn toàn độc lập** — nâng cấp admin không ảnh hưởng tài xế.

---

## Khởi động

Mỗi service chạy trong một terminal riêng.

### Lần đầu (cài dependencies)

```bash
cd tlx-driver-service && npm install
cd tlx-driver       && npm install
cd tlx-worker       && npm install
cd tlx-web          && npm install
```

### Chạy development

```bash
# Terminal 1 — Driver backend
cd tlx-driver-service
npm start

# Terminal 2 — Driver frontend
cd tlx-driver
npm run dev
# → http://localhost:5173

# Terminal 3 — Admin+KT backend
cd tlx-worker
npm start

# Terminal 4 — Admin+KT frontend
cd tlx-web
npm run dev
# → http://localhost:5174
```

---

## URL truy cập

| Ai | URL |
|----|-----|
| Tài xế | http://localhost:5173 |
| Admin | http://localhost:5174/admin |
| Kế toán | http://localhost:5174/accountant |

---

## Cấu hình môi trường

### tlx-driver-service/.env
```
PORT=8080
DATA_DIR=../tlx-worker/data   # trỏ vào cùng DB với tlx-worker
```

### tlx-worker/.env
```
PORT=8082
DATA_DIR=./data
DATABASE_URL=                  # để trống = SQLite, điền = PostgreSQL
APP_SECRET=                    # bắt buộc khi production
FPT_STT_API_KEY=               # hoặc cấu hình qua Admin UI
CORS_ORIGIN=*
OK_DELAY_MIN=400
OK_DELAY_MAX=1200
```

### tlx-driver/.env (nếu backend khác localhost)
```
VITE_API_BASE=http://your-server:8080
VITE_WS_BASE=ws://your-server:8080/ws
VITE_ADMIN_URL=http://your-server:5174
```

### tlx-web/.env (nếu backend khác localhost)
```
VITE_API_BASE=http://your-server:8082
VITE_WS_BASE=ws://your-server:8082/ws
```

---

## Tài khoản mặc định (seed)

| SĐT | Mật khẩu | Vai trò |
|-----|----------|---------|
| `admin` | `admin123` | Admin |

Đổi mật khẩu ngay sau khi vào Admin UI lần đầu qua nút "Reset MK".

---

## Database

- **Dev (mặc định)**: SQLite tại `tlx-worker/data/tlx.db`
- **Prod**: PostgreSQL — đặt `DATABASE_URL` trong `tlx-worker/.env`
- Cả `tlx-driver-service` và `tlx-worker` dùng **cùng một file DB** (SQLite WAL mode cho phép multi-process)

---

## Nâng cấp / deploy

- Cập nhật admin/kế toán: chỉ cần restart `tlx-worker` và `tlx-web` — tài xế không bị ảnh hưởng
- Cập nhật tài xế: chỉ cần restart `tlx-driver-service` và `tlx-driver` — admin/kế toán không bị ảnh hưởng

---

## Các thư mục quan trọng

```
tlx-worker/
├── src/
│   ├── index.js          # Server chính (Express + WS)
│   ├── sessionManager.js # Quản lý phiên Zalo per-user
│   ├── parser.js         # Tách tin nhắn → cuốc xe
│   ├── stt.js            # FPT.AI Speech-to-Text
│   ├── dbLayer.js        # SQLite/PG abstraction
│   └── config.js         # Cài đặt in-memory (voice, FPT key)
└── data/
    └── tlx.db            # SQLite database

tlx-driver-service/
└── src/
    └── index.js          # Server tài xế (import từ tlx-worker/src/dbLayer.js)
```
