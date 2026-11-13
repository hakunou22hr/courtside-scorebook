const CACHE='courtside-v55';
const CORE_ASSETS=[
  './',
  './index.html',
  './styles.css?v=12',
  './app.js?v=15',
  './mobile-controls.js?v=5',
  './voice-v3.js?v=1',
  './mic-monitor.js?v=1',
  './voice-ios-recovery.js?v=1',
  './live-running-score.js?v=3',
  './history-editor.js?v=3',
  './game-rules-enhancements.js?v=3',
  './sheet-static.js',
  './sheet-corrections.js?v=6',
  './sheet-precision-fix.js',
  './scoresheet-field-map.json',
  './manifest.webmanifest',
  './assets/スコアシート.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Cache every app-shell file while online. Keep install resilient so one
    // optional asset cannot prevent the whole PWA from becoming offline-ready.
    const results=await Promise.allSettled(CORE_ASSETS.map(asset=>cache.add(asset)));
    const indexReady=await cache.match('./index.html');
    const rootReady=await cache.match('./');
    if(!indexReady && !rootReady){
      const failed=results.filter(result=>result.status==='rejected').length;
      throw new Error(`Offline shell was not cached (failed assets: ${failed})`);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function updateCache(request){
  try{
    const response=await fetch(request);
    if(response && response.ok){
      const cache=await caches.open(CACHE);
      await cache.put(request,response.clone());
    }
    return response;
  }catch{
    return null;
  }
}

self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET') return;

  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;
  if(!sameOrigin) return;

  if(request.mode==='navigate'){
    // iPhone Home Screen launch must not wait for a failed network request.
    // Serve the cached app shell immediately, then refresh it in the background.
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const cached=
        await cache.match(request,{ignoreSearch:true}) ||
        await cache.match('./index.html',{ignoreSearch:true}) ||
        await cache.match('./',{ignoreSearch:true});
      if(cached){
        event.waitUntil(updateCache(request));
        return cached;
      }
      const network=await updateCache(request);
      if(network) return network;
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>COURTSIDE</title><p>オフライン用データを準備できませんでした。オンライン時に一度アプリを起動してください。</p>',
        {headers:{'Content-Type':'text/html; charset=utf-8'}}
      );
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached){
      // Cache-first keeps the scorebook usable offline; refresh silently online.
      event.waitUntil(updateCache(request));
      return cached;
    }
    const network=await updateCache(request);
    if(network) return network;
    return new Response('',{status:504,statusText:'Offline'});
  })());
});
