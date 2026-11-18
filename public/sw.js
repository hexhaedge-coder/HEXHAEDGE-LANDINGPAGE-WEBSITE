// HexhaEdge service worker.
// Pages: network first (always fresh), falling back to the saved copy after 2.5 s
// or when offline. Static assets: served from cache at once, refreshed behind.
// Nothing from Firebase, M-Pesa or any API is ever cached here.
const VERSION = "hx-v2";
const CORE = [
  "/",
  "/index.html",
  "/auth/",
  "/app/",
  "/assets/css/base.css",
  "/assets/css/landing.css",
  "/assets/css/app.css",
  "/assets/js/theme-init.js",
  "/assets/js/theme.js",
  "/assets/js/landing.js",
  "/assets/img/logo-480.webp",
  "/assets/img/mark-96.webp",
  "/assets/img/doors/build.svg",
  "/assets/img/doors/follow.svg",
  "/assets/img/doors/execute.svg",
  "/assets/img/doors/talk.svg",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isFont(url) {
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Only our own files and the web fonts. Everything else goes straight to the network.
  if (url.origin !== self.location.origin && !isFont(url)) return;
  // Staff screens are never stored on a device.
  if (url.pathname.startsWith("/staff")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 2500)),
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(req)) || (await cache.match(new URL(req.url).pathname.replace(/\/$/, "/index.html")));
    if (hit) return hit;
    return fetch(req);
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}
