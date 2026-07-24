const CACHE = 'shtachla2-v2';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./runner-template.html','./manifest.webmanifest',
  './icon-192.png','./icon-512.png','./icon-maskable-512.png','./icon-apple-touch.png'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

// Network-first for pages/HTML (always get the freshest index.html when online),
// cache-first for static assets. Both fall back to cache when offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isHTML = e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(r => {
        if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
        return r;
      }))
    );
  }
});
