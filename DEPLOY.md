# Hướng dẫn Deploy lên VPS

Dành cho giai đoạn 200–500 user. 1 VPS chạy được tất cả 4 service.

> **Server đang chạy:** `103.38.237.63`
> - Tài xế (homepage + app): `http://103.38.237.63/`
> - Admin: `http://103.38.237.63/admin/`
> - Kế toán: `http://103.38.237.63/accountant/`

---

## QUICK DEPLOY — Server 103.38.237.63 (1 IP, phân loại theo đường dẫn)

> Dùng hướng dẫn này nếu deploy lại hoặc cập nhật code lên server hiện tại.

### Cấu trúc URL trên server

| Đường dẫn | Phục vụ | Backend |
|---|---|---|
| `/` | Homepage + App tài xế (tlx-driver) | port 8080 |
| `/api/` | Driver API | port 8080 |
| `/ws` | Driver WebSocket | port 8080 |
| `/admin/` | Admin panel (tlx-web) | port 8082 |
| `/accountant/` | Kế toán panel (tlx-web) | port 8082 |
| `/admin-api/` | Admin + KT API | port 8082 |
| `/admin-ws` | Admin + KT WebSocket | port 8082 |

### Bước A — Lấy code mới

```bash
cd /opt/tlx
git pull
```

### Bước A.1 — Kiểm tra `.env` driver-service (BẮT BUỘC nếu lần đầu hoặc sau khi đổi DB)

```bash
cat /opt/tlx/tlx-driver-service/.env
```

**Phải có `DATABASE_URL` giống hệt `tlx-worker/.env`.** Nếu thiếu hoặc bị comment → driver dùng SQLite riêng, tài khoản duyệt rồi vẫn hiện "Chờ duyệt":

```bash
# Xem DATABASE_URL đang dùng trong worker:
grep DATABASE_URL /opt/tlx/tlx-worker/.env

# Cập nhật driver-service/.env (thay MAT_KHAU_MANH cho đúng):
cat > /opt/tlx/tlx-driver-service/.env <<'ENV'
PORT=8080
DATABASE_URL=postgres://tlx:MAT_KHAU_MANH@localhost:5432/tlx
APP_SECRET=<cùng APP_SECRET với tlx-worker>
CORS_ORIGIN=*
OK_DELAY_MIN=400
OK_DELAY_MAX=1200
ENV
```

Sau khi sửa `.env` phải **restart driver-service** và kiểm tra log có dòng `🗄️  Dùng PostgreSQL` (không được thấy `SQLite`):

```bash
pm2 restart tlx-driver-service
pm2 logs tlx-driver-service --lines 10
```

---

### Bước B — Cập nhật backend (khi có thay đổi code backend)

```bash
# Worker (Admin + KT backend, port 8082)
cd /opt/tlx/tlx-worker && npm install && pm2 restart tlx-worker

# Driver service (port 8080)
cd /opt/tlx/tlx-driver-service && npm install && pm2 restart tlx-driver-service
```

### Bước C — Build frontend tài xế (tlx-driver → Homepage + App)

```bash
cd /opt/tlx/tlx-driver
cat > .env <<'ENV'
VITE_API_BASE=http://103.38.237.63
VITE_WS_BASE=ws://103.38.237.63/ws
VITE_ADMIN_URL=http://103.38.237.63
ENV
npm install && npm run build
```

### Bước D — Build frontend Admin + Kế toán (tlx-web)

```bash
cd /opt/tlx/tlx-web
cat > .env <<'ENV'
VITE_API_BASE=http://103.38.237.63/admin-api
VITE_WS_BASE=ws://103.38.237.63/admin-ws
ENV
npm install && npm run build
```

> `tlx-web` dùng `base: "./"` trong `vite.config.js` — assets sẽ ở `/admin/assets/...` và `/accountant/assets/...`, không conflict với assets của tlx-driver ở `/assets/`.

### Bước E — Nginx config (nếu chưa có hoặc cần sửa)

Tạo file `/etc/nginx/sites-available/tlx`:

```nginx
server {
    listen 80;
    server_name 103.38.237.63;

    # ── Admin + Kế Toán API (tlx-worker, port 8082) ──────────────
    location /admin-api/ {
        rewrite ^/admin-api/(.*)$ /api/$1 break;
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /admin-ws {
        proxy_pass http://127.0.0.1:8082/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    # ── Driver API (tlx-driver-service, port 8080) ────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    # ── Admin + Kế Toán SPA (tlx-web dist) ───────────────────────
    location = /admin      { return 301 /admin/; }
    location = /accountant { return 301 /accountant/; }

    location /admin/ {
        alias /opt/tlx/tlx-web/dist/;
        try_files $uri $uri/ /opt/tlx/tlx-web/dist/index.html;
    }
    location /accountant/ {
        alias /opt/tlx/tlx-web/dist/;
        try_files $uri $uri/ /opt/tlx/tlx-web/dist/index.html;
    }

    # ── Homepage + Driver SPA (tlx-driver dist) ──────────────────
    root /opt/tlx/tlx-driver/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/tlx /etc/nginx/sites-enabled/tlx
# Xoá default nếu còn
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### Kiểm tra sau deploy

```bash
curl -I http://103.38.237.63/api/health          # driver-service OK
curl -I http://103.38.237.63/admin-api/health     # worker OK

# Mở trình duyệt kiểm tra:
# http://103.38.237.63/             → Homepage tài xế (có nút Đăng ký / Đăng nhập)
# http://103.38.237.63/admin/       → Màn đăng nhập Admin
# http://103.38.237.63/accountant/  → Màn đăng nhập Kế toán
```

---

## 0. Chọn VPS

**Cấu hình tối thiểu cho 200–500 user:**
- CPU: 4 vCPU
- RAM: 8 GB (mỗi phiên zca-js ~20–60 MB; 8 GB gánh ~150–250 phiên)
- Ổ: 80 GB SSD NVMe
- OS: Ubuntu 22.04 hoặc 24.04 LTS

**Nhà cung cấp:**
- Việt Nam (ping thấp): Vietserver, BizflyCloud, VNG Cloud, TinoHost
- Quốc tế (rẻ, mạnh): Hetzner CPX31/CPX41, DigitalOcean, Vultr

> Ưu tiên IP sạch — nhiều phiên zca-js cùng 1 IP dễ bị Zalo chặn theo IP.

---

## 1. Chuẩn bị VPS

```bash
ssh root@<IP_VPS>
apt update && apt upgrade -y
apt install -y nodejs npm build-essential git nginx
npm install -g n && n 20   # Node.js 20 LTS
```

Kiểm tra: `node -v` phải ra `v20.x`.

---

## 2. Cài PostgreSQL (production)

```bash
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql

sudo -u postgres psql <<'SQL'
CREATE USER tlx WITH PASSWORD 'MAT_KHAU_MANH';
CREATE DATABASE tlx OWNER tlx;
GRANT ALL PRIVILEGES ON DATABASE tlx TO tlx;
SQL
```

Chuỗi kết nối: `postgres://tlx:MAT_KHAU_MANH@localhost:5432/tlx`

---

## 3. Tải code lên VPS

```bash
cd /opt
git clone <repo-url> tlx
cd tlx
```

Hoặc upload zip:
```bash
# Từ máy local:
scp TroLyTaiXe-AI.zip root@<IP>:/opt/
# Trên VPS:
cd /opt && unzip TroLyTaiXe-AI.zip && mv TroLyTaiXe-AI tlx && cd tlx
```

---

## 4. Tạo APP_SECRET dùng chung

Cookie Zalo được mã hoá AES-256-GCM bằng `APP_SECRET`. **Dùng cùng 1 secret cho cả 2 backend.**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Copy chuỗi này để dùng ở bước 5 và 6
```

> **Giữ APP_SECRET cố định.** Đổi secret sẽ khiến toàn bộ phiên Zalo đã lưu mất hiệu lực.

---

## 5. Cấu hình & chạy tlx-worker (Admin+KT backend, port 8082)

```bash
cd /opt/tlx/tlx-worker
cp .env.example .env
nano .env
```

Nội dung `.env`:
```
PORT=8082
DATABASE_URL=postgres://tlx:MAT_KHAU_MANH@localhost:5432/tlx
APP_SECRET=<chuỗi vừa tạo ở bước 4>
CORS_ORIGIN=https://ten-mien.com
DEBUG_RAW=false
OK_DELAY_MIN=400
OK_DELAY_MAX=1200
```

> **FPT STT API Key** (nhận dạng giọng nói): KHÔNG đặt trong `.env` — set qua Admin UI sau khi deploy xong (`Admin → Cài đặt → FPT API Key`).

```bash
npm install
npm start   # kiểm tra thấy "Server cổng 8082" và "Dùng PostgreSQL"
# Ctrl+C → PM2 sẽ chạy nền ở bước 7
```

---

## 6. Cấu hình & chạy tlx-driver-service (Driver backend, port 8080)

```bash
cd /opt/tlx/tlx-driver-service
nano .env
```

Nội dung `.env`:
```
PORT=8080
DATABASE_URL=postgres://tlx:MAT_KHAU_MANH@localhost:5432/tlx
APP_SECRET=<cùng chuỗi ở bước 4>
CORS_ORIGIN=https://ten-mien.com
OK_DELAY_MIN=400
OK_DELAY_MAX=1200
```

> `DATABASE_URL` phải **giống hệt** bước 5 — driver-service dùng chung DB với tlx-worker. Nếu để trống sẽ dùng SQLite riêng, dữ liệu không đồng bộ.

```bash
npm install
npm start   # kiểm tra thấy "Server cổng 8080"
# Ctrl+C → PM2 sẽ chạy nền ở bước 7
```

---

## 7. Build frontend

### Driver frontend (tlx-driver → phục vụ tại /)

```bash
cd /opt/tlx/tlx-driver
cat > .env <<'ENV'
VITE_API_BASE=https://ten-mien.com
VITE_WS_BASE=wss://ten-mien.com/ws
VITE_ADMIN_URL=https://admin.ten-mien.com
ENV
npm install && npm run build   # tạo dist/
```

### Admin+KT frontend (tlx-web → phục vụ tại admin.ten-mien.com)

```bash
cd /opt/tlx/tlx-web
cat > .env <<'ENV'
VITE_API_BASE=https://admin.ten-mien.com
VITE_WS_BASE=wss://admin.ten-mien.com/ws
ENV
npm install && npm run build   # tạo dist/
```

> Nếu dùng 1 domain duy nhất, xem cấu hình Nginx option B ở bước 9.

---

## 8. Chạy backend nền bằng PM2

```bash
npm install -g pm2

cd /opt/tlx/tlx-worker
pm2 start src/index.js --name tlx-worker

cd /opt/tlx/tlx-driver-service
pm2 start src/index.js --name tlx-driver-service

pm2 save
pm2 startup   # chạy dòng lệnh nó in ra để bật auto-start khi reboot
```

Kiểm tra: `pm2 list` — cả 2 process phải `online`.

---

## 9. Nginx — 2 option

### Option A: 2 domain riêng (khuyến nghị)

`ten-mien.com` → tlx-driver frontend  
`admin.ten-mien.com` → tlx-web frontend

```bash
nano /etc/nginx/sites-available/tlx-driver
```

```nginx
server {
    listen 80;
    server_name ten-mien.com;

    root /opt/tlx/tlx-driver/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

```bash
nano /etc/nginx/sites-available/tlx-admin
```

```nginx
server {
    listen 80;
    server_name admin.ten-mien.com;

    root /opt/tlx/tlx-web/dist;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tlx-driver /etc/nginx/sites-enabled/
ln -s /etc/nginx/sites-available/tlx-admin /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

### Option B: 1 domain, phân biệt bằng path

Nếu chỉ có 1 domain (`ten-mien.com`), đặt admin tại `/admin-ui/`:

```nginx
server {
    listen 80;
    server_name ten-mien.com;

    # Driver frontend (mặc định)
    root /opt/tlx/tlx-driver/dist;
    location / { try_files $uri $uri/ /index.html; }

    # Driver API + WS
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
    }
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }

    # Admin+KT frontend tại /admin-ui/
    location /admin-ui/ {
        alias /opt/tlx/tlx-web/dist/;
        try_files $uri $uri/ /admin-ui/index.html;
    }

    # Admin+KT API (dùng prefix /admin-api/)
    location /admin-api/ {
        rewrite ^/admin-api/(.*)$ /api/$1 break;
        proxy_pass http://127.0.0.1:8082;
        proxy_set_header Host $host;
    }
    location /admin-ws {
        proxy_pass http://127.0.0.1:8082/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

> Với option B, cần cập nhật biến `VITE_API_BASE=/admin-api` và `VITE_WS_BASE=wss://ten-mien.com/admin-ws` trong `tlx-web/.env` trước khi build.

---

## 10. HTTPS bắt buộc

```bash
apt install -y certbot python3-certbot-nginx

# Option A (2 domain):
certbot --nginx -d ten-mien.com -d admin.ten-mien.com

# Option B (1 domain):
certbot --nginx -d ten-mien.com
```

Certbot tự chỉnh Nginx sang port 443 và tự gia hạn hàng 3 tháng.

---

## 11. Tường lửa

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
# KHÔNG mở port 8080 và 8082 ra ngoài — chỉ Nginx truy cập nội bộ
```

---

## 12. Kiểm tra sau deploy

```bash
# Backend health
curl https://ten-mien.com/health           # driver-service
curl https://admin.ten-mien.com/health     # worker

# PM2
pm2 list
pm2 logs tlx-worker --lines 50
pm2 logs tlx-driver-service --lines 50
```

Trình duyệt:
- `https://ten-mien.com` → màn đăng nhập tài xế
- `https://admin.ten-mien.com/admin` → màn đăng nhập admin
- Đăng nhập `admin / admin` → **ĐỔI MẬT KHẨU NGAY**

---

## Bảo trì & nâng cấp

```bash
cd /opt/tlx && git pull

# Nâng cấp admin/KT (không cần dừng driver):
cd tlx-worker && npm install && pm2 restart tlx-worker
cd ../tlx-web && npm install && npm run build

# Nâng cấp driver (không cần dừng admin):
cd ../tlx-driver-service && npm install && pm2 restart tlx-driver-service
cd ../tlx-driver && npm install && npm run build
```

---

## Sao lưu database

```bash
# PostgreSQL — đặt cron hàng ngày
pg_dump -U tlx tlx > /opt/backup/tlx-$(date +%F).sql

# SQLite (nếu dùng)
cp /opt/tlx/tlx-worker/data/tlx.db /opt/backup/tlx-$(date +%F).db
```

---

## Checklist bảo mật production

- [ ] Đổi mật khẩu admin mặc định (`admin / admin`)
- [ ] Đặt `APP_SECRET` trong cả 2 `.env` (cùng 1 chuỗi)
- [ ] `CORS_ORIGIN` ghi đúng domain, không để `*`
- [ ] HTTPS bật (certbot)
- [ ] Port 8080 và 8082 **không** mở ra internet
- [ ] Mật khẩu PostgreSQL mạnh
- [ ] Backup DB tự động bằng cron

---

## Scale khi vượt 250 user

1 VPS (8 GB RAM) gánh được ~150–250 phiên zca-js. Khi vượt:
- Thêm VPS worker thứ 2 cho driver-service
- Tách Redis thay Map RAM để share token giữa các node
- Xem **ARCHITECTURE.md** mục "Giai đoạn 2" để biết kiến trúc scale ngang đầy đủ
