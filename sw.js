/* ShiftCare Service Worker v3.1 */
const CACHE = 'shiftcare-v3.1.0';
const PRECACHE = [
  './ShiftCare-v3_1_0.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

/* CDN resources to cache on first use */
const CDN_ORIGINS = [
  'https://cdnjs.cloudflare.com',
  'https://cdn.jsdelivr.net'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* App shell: cache-first */
  if (e.request.mode === 'navigate' || PRECACHE.some(p => url.pathname.endsWith(p.replace('./', '')))) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  /* CDN resources: cache-first with network fallback */
  if (CDN_ORIGINS.some(o => url.origin === o.replace('https://', '') || e.request.url.startsWith(o))) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
      })
    );
    return;
  }

  /* AI/API calls and everything else: network only */
  /* (no caching for shiftcare.pedicode-app.workers.dev) */
  e.respondWith(fetch(e.request).catch(() => {
    /* If offline and navigating, serve cached shell */
    if (e.request.mode === 'navigate') {
      return caches.match('./ShiftCare-v3_1_0.html');
    }
  }));
});
