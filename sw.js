const CACHE='courtside-v46';
const ASSETS=['./','index.html','styles.css?v=5','app.js?v=6','mobile-controls.js?v=5','voice-v3.js?v=1','mic-monitor.js?v=1','voice-ios-recovery.js?v=1','live-running-score.js?v=2','history-editor.js?v=1','game-rules-enhancements.js?v=3','sheet-static.js','sheet-corrections.js','sheet-precision-fix.js','scoresheet-field-map.json','manifest.webmanifest','assets/スコアシート.jpg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isNavigation = request.mode === 'navigate';
  const isLiveCode = sameOrigin && /\.(?:html|js|css)$/.test(url.pathname);

  if (isNavigation || isLiveCode) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(response => {
      if (sameOrigin && response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});