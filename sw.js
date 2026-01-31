const CACHE = "gmsf-web-v3";

const CORE = [
  "/",
  "/index.html",
  "/app.js",
  "/gmsf.js",
  "/notePack.js",
  "/manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      await c.addAll(CORE);
    } catch (err) {
      console.warn("CORE cache addAll failed:", err);
      for (const u of CORE) {
        try { await c.add(u); } catch {}
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;

  const resp = await fetch(req);
  if (resp && resp.ok) cache.put(req, resp.clone());
  return resp;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);

  const fetchPromise = fetch(req).then((resp) => {
    if (resp && resp.ok) cache.put(req, resp.clone());
    return resp;
  }).catch(() => null);

  return hit || (await fetchPromise) || hit;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", resp.clone()).catch(() => {});
        return resp;
      } catch {
        return (await caches.match("/index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  if (url.pathname.includes("./assets/")) {
    e.respondWith(cacheFirst(req));
    return;
  }

  e.respondWith(staleWhileRevalidate(req));
});
