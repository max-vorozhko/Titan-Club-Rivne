// Сервіс-воркер Titan Run: швидкий запуск з іконки на екрані й робота без інтернету (гра без рейтингів).
// Сторінку (index.html) беремо з мережі, а якщо її немає — з кешу; файли з ?v=N — з кешу (вони не змінюються).
// Firebase, Google, статистика й адмінка йдуть повз кеш.
const CACHE = "titan-run-v31";
const CORE = ["./", "index.html", "manifest.webmanifest", "assets/logo.png", "assets/icons/icon-192.png", "assets/icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase, шрифти, GoatCounter — як завжди, з мережі
  if (url.pathname.endsWith("/admin.html") || url.pathname.includes("/js/admin.js")) return;

  // Сторінка: спершу мережа (щоб оновлення приходили одразу), без мережі — збережена копія
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html"))
    );
    return;
  }

  // Скрипти, стилі, картинки: з кешу, а в фоні оновлюємо
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
