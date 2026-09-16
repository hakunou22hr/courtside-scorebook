const CACHE='courtside-v19';
const ASSETS=['./','index.html','styles.css','app.js','voice-v2.js','sheet-static.js','sheet-corrections.js','sheet-precision-fix.js','scoresheet-field-map.json','manifest.webmanifest','assets/スコアシート.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
