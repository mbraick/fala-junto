// Service worker: deixa o app funcionando sem internet
const CACHE = "fala-junto-a08ecfa4";
const FILES = [
 "./",
 "index.html",
 "app.js",
 "data.js",
 "jszip.min.js",
 "manifest.webmanifest",
 "icon-192.png",
 "icon-512.png",
 "symbols.js",
 "icon-maskable-512.png",
 "apple-touch-icon.png"
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // pictogramas ARASAAC e API: sempre rede
  if (/arasaac\.org$/.test(url.hostname)) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
