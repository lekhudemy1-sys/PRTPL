/* Prithvi Realcon – offline cache worker.
   - Pages: network first (always the latest deploy), cached copy when offline.
   - Own assets and CDN libraries: served from cache instantly, refreshed in the background.
   - Supabase / any non-GET request: never touched, so data is always live. */
const VERSION = 'prtpl-v2.3';
const SHELL = [
  'index.html', 'home_page.html', 'amm_home.html', 'odr_home.html', 'notices.html', 'offline.html',
  'favicon.svg', 'icon-192.png', 'icon-512.png', 'inspiration.jpg', 'manifest.webmanifest'
];
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NAV_TIMEOUT = 4500;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

function keep(req, res) {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone();
    caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const fallback = () => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('offline.html'));
    const timer = setTimeout(() => { if (!settled) fallback().then(r => { if (r && !settled) { settled = true; resolve(r); } }); }, NAV_TIMEOUT);
    fetch(req).then(res => { if (settled) return keep(req, res); settled = true; clearTimeout(timer); resolve(keep(req, res)); })
      .catch(() => { if (settled) return; settled = true; clearTimeout(timer); fallback().then(resolve); });
  });
}

function staleWhileRevalidate(req) {
  return caches.match(req).then(hit => {
    const fresh = fetch(req).then(res => keep(req, res)).catch(() => hit);
    return hit || fresh;
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) return;     // live data: never cache
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || /\.html?$/.test(url.pathname) || url.pathname.endsWith('/')) e.respondWith(networkFirst(req));
    else e.respondWith(staleWhileRevalidate(req));
  } else if (LIB_HOSTS.includes(url.hostname) || req.destination === 'image') {
    e.respondWith(staleWhileRevalidate(req));
  }
});
