# Kiến trúc & Khả năng chịu tải

Tài liệu này trả lời: **app có chạy mượt cho 200–500 (và xa hơn 5000) người dùng đồng thời không?**

## Kiến trúc hiện tại — 4 service

```
tlx-driver-service/  (port 8080) — backend tài xế (zca-js, API, WS)
tlx-driver/          (port 5173) — frontend tài xế
tlx-worker/          (port 8082) — backend admin + kế toán (zca-js kế toán, API, WS)
tlx-web/             (port 5174) — frontend admin + kế toán
```

Hai backend dùng chung `tlx-worker/data/tlx.db` (SQLite WAL). Nâng cấp admin/kế toán không ảnh hưởng tài xế.

## Tóm tắt thẳng thắn

Nút thắt **KHÔNG phải web app hay database** — mà là **số phiên zca-js**. Mỗi user =
1 phiên Zalo = 1 WebSocket tới Zalo + 1 listener. Đây là phần nặng nhất và quyết định
toàn bộ khả năng scale.

| Thành phần | 200–500 user | 5000 user |
|---|---|---|
| Web frontend (tĩnh) | Thoải mái | Thoải mái (CDN) |
| PostgreSQL | Thoải mái | Thoải mái (có index) |
| WebSocket tới user | Ổn (1 VPS) | Cần nhiều node |
| **Phiên zca-js** | **~1–2 VPS** | **~10–25 VPS/worker** |

## Vì sao zca-js là nút thắt

- Mỗi phiên giữ socket + buffer + lắng nghe liên tục → ~20–60MB RAM/phiên.
- Node 1 luồng: 500 listener cùng parse tin sẽ bắt đầu nghẽn event loop.
- Zalo rate-limit theo IP: quá nhiều phiên cùng IP dễ bị chặn.

**Phép tính thực tế:**
- 1 VPS 4 vCPU / 8GB RAM chạy ổn khoảng **150–250 phiên** zca-js.
- 500 user → **2–3 VPS worker**.
- 5000 user → **20–25 VPS worker** + 1 lớp điều phối.

Không có "1 VPS thật to" nào gánh 5000 phiên trong 1 process. Bắt buộc **scale ngang**.

## Kiến trúc khuyến nghị theo giai đoạn

### Giai đoạn 1 — 200–500 user (làm ngay)
```
[ Cloudflare/CDN ]         ← phục vụ web tĩnh (React build), cache toàn cầu
        │
[ Nginx reverse proxy ]    ← HTTPS, định tuyến /api và /ws
        │
   ┌────┴─────┐
[ Worker 1 ] [ Worker 2 ]  ← mỗi worker giữ ~150–250 phiên zca-js
        │
[ PostgreSQL ]             ← 1 instance, có index (đủ cho giai đoạn này)
```
- 1 VPS chính (Nginx + PostgreSQL + Worker-1) + 1 VPS phụ (Worker-2) nếu cần.
- Đủ cho 200–500 user. Chi phí thấp.

### Giai đoạn 2 — hướng tới 5000 user (mở rộng sau)
```
[ CDN ] → [ Load Balancer ]
                │
        [ Nhiều Nginx ]
                │
   [ Worker Pool: 20–25 node ]  ← điều phối qua Redis (user nào ở worker nào)
                │
        [ Redis ] (pub/sub realtime + session token + registry)
                │
   [ PostgreSQL primary + read replica ]
```
- **Redis** thay Map trong RAM: lưu token đăng nhập, registry "user→worker",
  pub/sub đẩy cuốc. Bắt buộc khi có nhiều worker (vì user A có thể nối WS vào node
  khác node đang giữ phiên Zalo của A).
- **Mỗi worker** chỉ giữ một phần phiên. Một worker chết không kéo sập cả hệ thống.
- **Proxy/IP riêng cho mỗi nhóm phiên** để giảm nguy cơ Zalo chặn theo IP.

## Những gì ĐÃ tối ưu trong code hiện tại

- **DB async + connection pool** (`db.pg.js`, PG_POOL_MAX): không nghẽn khi nhiều
  request đồng thời.
- **Index** trên `users(phone)` và `saved_trips(user_id, taken_at)`: truy vấn nhanh
  kể cả khi bảng lớn.
- **Chỉ lưu cuốc đã nhận** vào DB; cuốc rác chỉ ở RAM, tự trôi → DB không phình.
- **Cache 30 tin/phiên** thay vì 300: nhẹ RAM.
- **Giới hạn cuốc hiển thị (10–50)** phía client: ít DOM, mobile không lag.
- **WebSocket cô lập theo user**: chỉ đẩy đúng cuốc của user đó, không broadcast thừa.
- **Service Worker** cache asset tĩnh: app mở lần 2 trở đi gần như tức thì trên mobile.
  (SW KHÔNG cache API/WebSocket — dữ liệu cuốc luôn realtime.)

## Việc CẦN làm khi vượt ~250 user (giai đoạn 2)

1. Tách `sessions` token-map và `clientsByUser` sang **Redis**.
2. Worker đăng ký vào registry Redis: `user_id → worker_id`. WS nối vào node bất kỳ
   sẽ được route (qua Redis pub/sub) tới worker đang giữ phiên Zalo của user.
3. Mỗi worker đặt giới hạn cứng số phiên (vd 200); vượt thì spawn worker mới.
4. Dùng PM2 cluster hoặc Docker + orchestrator để auto-restart worker chết.
5. Gán proxy/IP riêng theo nhóm phiên.

## Giám sát
- Endpoint `/health` trả số phiên đang giữ (`sessions`).
- Theo dõi RAM/CPU mỗi worker; khi 1 worker > 200 phiên hoặc RAM > 80% → thêm node.
- Theo dõi tỉ lệ phiên Zalo bị rớt/khoá — đây là chỉ số sống còn của mô hình.
