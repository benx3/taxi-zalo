# Hướng dẫn Deploy lên VPS (từng bước)

Dành cho giai đoạn 200–500 user. Một VPS chính chạy được. Khi đông hơn, xem ARCHITECTURE.md.

## 0. Nên mua VPS nào?

**Khuyến nghị giai đoạn đầu (200–500 user):**
- **CPU:** 4 vCPU
- **RAM:** 8 GB  (mỗi phiên zca-js ~20–60MB; 8GB gánh ~150–250 phiên + Postgres + Node)
- **Ổ:** 80 GB SSD NVMe
- **Băng thông:** càng cao càng tốt (realtime nhiều kết nối)
- **OS:** Ubuntu 24.04 LTS

**Nhà cung cấp gợi ý (chọn 1):**
- **Quốc tế:** Hetzner (rẻ, mạnh — CPX31/CPX41), DigitalOcean, Vultr, Linode.
- **Việt Nam (ping thấp cho user VN):** Vietserver, BizflyCloud, VNG Cloud, TinoHost VPS.
  → Ưu tiên VPS đặt ở VN vì user là tài xế VN, độ trễ thấp quan trọng cho realtime.
- Lưu ý IP: nên có **IP sạch**, và sau này khi scale cần **nhiều IP** (giảm rủi ro Zalo
  chặn theo IP). Hỏi nhà cung cấp về việc thêm IP phụ.

**Khi tiến tới 5000 user:** 1 VPS không đủ — cần 20–25 VPS worker + Redis + Load Balancer.
Lúc đó cân nhắc cloud có auto-scaling (AWS/GCP) hoặc cụm VPS + script điều phối.

---

## 1. Kết nối VPS & cập nhật

```bash
ssh root@<IP_VPS>
apt update && apt upgrade -y
```

## 2. Cài Node.js 20 + công cụ build (cho better-sqlite3 nếu cần)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs build-essential git
node -v   # phải ra v20.x
```

## 3. Cài PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl enable --now postgresql

# tạo database và user
sudo -u postgres psql <<'SQL'
CREATE USER tlx WITH PASSWORD 'doi_mat_khau_manh_o_day';
CREATE DATABASE tlx OWNER tlx;
GRANT ALL PRIVILEGES ON DATABASE tlx TO tlx;
SQL
```
Chuỗi kết nối sẽ là: `postgres://tlx:doi_mat_khau_manh_o_day@localhost:5432/tlx`

## 4. Tải code lên VPS

Cách A — qua git (khuyến nghị):
```bash
cd /opt
git clone <repo-cua-ban> tlx
cd tlx
```
Cách B — upload zip rồi giải nén:
```bash
# từ máy bạn: scp TroLyTaiXe-AI.zip root@<IP>:/opt/
cd /opt && unzip TroLyTaiXe-AI.zip && mv TroLyTaiXe-AI tlx && cd tlx
```

## 5. Cấu hình & chạy BACKEND (worker)

```bash
cd /opt/tlx/tlx-worker
cp .env.example .env
nano .env
```
Sửa trong `.env`:
```
PORT=8080
DATABASE_URL=postgres://tlx:doi_mat_khau_manh_o_day@localhost:5432/tlx
CORS_ORIGIN=https://ten-mien-cua-ban.com
DEBUG_RAW=false
```
Cài và chạy thử:
```bash
npm install
npm start          # thấy "Dùng PostgreSQL" + "Server cổng 8080" là OK
# Ctrl+C để dừng, ta sẽ chạy nền bằng PM2 ở bước 7
```

## 6. Build FRONTEND (web)

```bash
cd /opt/tlx/tlx-web
# tạo file .env cho web trỏ tới API qua domain (HTTPS/WSS)
cat > .env <<'ENV'
VITE_API_BASE=https://ten-mien-cua-ban.com
VITE_WS_BASE=wss://ten-mien-cua-ban.com/ws
ENV

npm install
npm run build      # tạo thư mục dist/ (web tĩnh)
```

## 7. Chạy backend nền bằng PM2 (tự khởi động lại khi crash/reboot)

```bash
npm install -g pm2
cd /opt/tlx/tlx-worker
pm2 start src/index.js --name tlx-worker
pm2 save
pm2 startup        # chạy dòng lệnh nó in ra để bật auto-start khi reboot
pm2 logs tlx-worker   # xem log
```

## 8. Nginx: phục vụ web tĩnh + proxy API/WebSocket + HTTPS

```bash
apt install -y nginx
nano /etc/nginx/sites-available/tlx
```
Dán cấu hình (đổi `ten-mien-cua-ban.com`):
```nginx
server {
    listen 80;
    server_name ten-mien-cua-ban.com;

    # web tĩnh (React build)
    root /opt/tlx/tlx-web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;   # giữ kết nối realtime lâu
    }
}
```
Bật site:
```bash
ln -s /etc/nginx/sites-available/tlx /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 9. HTTPS miễn phí (Let's Encrypt) — BẮT BUỘC

WebSocket bảo mật (wss) và bảo vệ mật khẩu cần HTTPS.
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d ten-mien-cua-ban.com
```
Certbot tự sửa Nginx sang 443 + tự gia hạn. Sau bước này dùng `https://` và `wss://`.

## 10. Tường lửa

```bash
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable
# KHÔNG mở cổng 8080 ra ngoài — chỉ Nginx (localhost) gọi nó.
```

## 11. Kiểm tra

- Mở `https://ten-mien-cua-ban.com` → thấy trang đăng nhập.
- Đăng nhập `admin / admin` → ĐỔI MẬT KHẨU admin ngay.
- `https://ten-mien-cua-ban.com/health` → trả số phiên đang chạy.

---

## Bảo trì & nâng cấp

```bash
# cập nhật code mới
cd /opt/tlx && git pull
cd tlx-worker && npm install && pm2 restart tlx-worker
cd ../tlx-web && npm install && npm run build   # Nginx tự phục vụ dist mới
```

## Sao lưu database (nên đặt cron hằng ngày)
```bash
pg_dump -U tlx tlx > /opt/backup/tlx-$(date +%F).sql
```

## Khi nào cần thêm VPS?
- `/health` báo > 200 phiên, hoặc RAM > 80% → thêm 1 VPS worker.
- Xem ARCHITECTURE.md mục "Giai đoạn 2" để tách Redis + nhiều worker.

## Checklist bảo mật production
- [ ] Đổi mật khẩu admin mặc định.
- [ ] Mật khẩu PostgreSQL mạnh, không để mặc định.
- [ ] CORS_ORIGIN ghi đúng domain (không để `*`).
- [ ] HTTPS bật (certbot).
- [ ] Cổng 8080 KHÔNG mở ra internet.
- [x] Mật khẩu hash bằng **bcrypt** (đã làm; hash SHA-256 cũ tự nâng cấp khi đăng nhập).
- [ ] **Đặt APP_SECRET** trong `.env` để **mã hoá cookie Zalo** trong DB (xem bước bên dưới).

## Đặt APP_SECRET để mã hoá cookie Zalo (QUAN TRỌNG)

Cookie Zalo cho phép chiếm phiên Zalo của user — nếu DB lộ mà cookie không mã hoá thì rất nguy hiểm.
Tạo khoá bí mật và đưa vào `.env`:
```bash
# tạo chuỗi ngẫu nhiên
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# copy kết quả, dán vào tlx-worker/.env:
#   APP_SECRET=<chuỗi vừa tạo>
```
Lưu ý:
- Khi CHƯA đặt APP_SECRET (dev): cookie lưu thẳng (tiện debug).
- Khi ĐÃ đặt (production): cookie tự động mã hoá AES-256-GCM.
- **Giữ APP_SECRET cố định** — đổi khoá sẽ khiến các cookie đã mã hoá cũ không giải mã được
  (user phải quét lại QR Zalo). Sao lưu khoá an toàn, KHÔNG commit lên git.
- Cookie cũ chưa mã hoá vẫn đọc được bình thường (tương thích ngược); chúng sẽ được mã hoá
  lại trong lần lưu phiên kế tiếp.
