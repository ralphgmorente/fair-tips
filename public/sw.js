/*
 * ShiftFlow service worker.
 *
 * Deliberately conservative. The app is behind a login and every page can contain
 * payout figures, so no HTML response is ever cached — a cached dashboard would leak
 * one manager's numbers to the next person to open the app on a shared iPad, and would
 * keep serving a signed-out user their old session's screen.
 *
 * Only build assets and icons are cached, and only ones this origin served.
 */
const CACHE = "shiftflow-static-v1";

const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/", "/splash/"];

self.addEventListener("install", (event) => {
  // Take over immediately so a new deploy is not shadowed by an old worker.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const isStatic = CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (isStatic) {
    // Build assets are content-hashed, so a hit is always current.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Everything else — pages, auth, API — always goes to the network. When the network
  // is gone, a navigation gets a plain offline notice rather than stale private data.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
              `<title>Offline · ShiftFlow</title>` +
              `<div style="font:16px/1.6 system-ui;padding:48px 24px;max-width:32rem;margin:0 auto;color:#111">` +
              `<h1 style="font-size:20px;margin:0 0 8px">You're offline</h1>` +
              `<p style="color:#555;margin:0">ShiftFlow needs a connection to load your payouts. ` +
              `Reconnect and try again.</p></div>`,
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          )
      )
    );
  }
});
