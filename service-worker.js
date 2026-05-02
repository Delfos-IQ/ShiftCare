/* ShiftCare Service Worker v3.5.7
   Cache-first para assets, network-first para API */

const CACHE_NAME   = 'shiftcare-v3.5.7';
const API_ORIGINS  = ['shiftcare.pedicode-app.workers.dev', 'api.groq.com'];

/* Assets to precache on install */
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32x32.png',
];

/* CDN libraries (cached on first use) */
const CDN_ORIGINS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ① API calls → network-first, no cache
  if (API_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(
      fetch(event.request).catch(err =>
        new Response(JSON.stringify({ error: 'sem ligação — verifica a tua rede', detail: err.message }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // ② CDN libraries → cache-first with network fallback
  if (CDN_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // ③ index.html → network-first (garante versão sempre actualizada)
  if (event.request.method !== 'GET') return;

  const isHTML = event.request.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');

  if (isHTML) {
    event.respondWith(
      fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => caches.match(event.request) || caches.match('./index.html'))
    );
    return;
  }

  // ④ Outros assets estáticos → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => null);
    })
  );
});
