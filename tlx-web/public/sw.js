// Service Worker — cache static assets để app load nhanh trên mobile.
// CHỈ cache file tĩnh (JS/CSS/HTML/ảnh). KHÔNG cache API/WebSocket (dữ liệu realtime).
const CACHE = "tlx-v2";
const STATIC = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // KHÔNG đụng vào API và WebSocket — luôn lấy mạng (realtime)
  if (url.pathname.startsWith("/api") || url.protocol.startsWith("ws")) return;
  if (e.request.method !== "GET") return;
  // cache-first cho asset tĩnh, network fallback
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached || fetch(e.request).then((res) => {
        // chỉ cache asset cùng origin (JS/CSS có hash từ Vite)
        if (res.ok && url.origin === self.location.origin && /\.(js|css|png|jpg|svg|woff2?)$/.test(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached)
    )
  );
});
