// Service worker: deixa o app funcionando sem internet
const CACHE = "fala-junto-45af56b2";
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
// baixa sempre do servidor (cache: "reload") para não guardar uma cópia velha
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => { if (e.data === "versao") e.source.postMessage({ versao: CACHE }); });
const fresh = (req) => fetch(req, { cache: "no-cache" }).then((res) => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
  return res;
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (/arasaac\.org$|openverse\.org$/.test(url.hostname)) return;
  const own = url.origin === location.origin;
  // páginas e código: tenta a internet primeiro (até 3 s); sem internet, usa a cópia guardada
  if (own && (req.mode === "navigate" || /\.(html|js|webmanifest)$/.test(url.pathname) || url.pathname.endsWith("/"))) {
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fallback = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html"));
      const t = setTimeout(() => { if (!done) { done = true; fallback().then(resolve); } }, 3000);
      fresh(req).then((res) => { if (!done) { done = true; clearTimeout(t); resolve(res); } })
        .catch(() => { if (!done) { done = true; clearTimeout(t); fallback().then(resolve); } });
    }));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && (own || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
