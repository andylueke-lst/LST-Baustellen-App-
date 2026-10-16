const CACHE='lst-test-v05-20261016-1';
const FILES=['./','./index.html','./app.js','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lst-test-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;const url=new URL(e.request.url);const asset=FILES.map(f=>new URL(f,self.registration.scope).href).includes(url.href);if(e.request.mode==='navigate')e.respondWith(caches.match(new URL('./index.html',self.registration.scope)).then(r=>r||fetch(e.request)));else if(asset)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
