const V="czytnik-biblii-v3",SHELL=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const same=new URL(r.url).origin===location.origin;
  e.respondWith(same
    // pliki aplikacji: najpierw pamięć podręczna, odświeżanie w tle
    ?caches.match(r).then(hit=>{const net=fetch(r).then(x=>{if(x.ok)caches.open(V).then(c=>c.put(r,x.clone()));return x}).catch(()=>hit);return hit||net})
    // teksty biblijne, słownik, czcionki: najpierw sieć, offline z pamięci
    :fetch(r).then(x=>{if(x.ok||x.type==="opaque")caches.open(V).then(c=>c.put(r,x.clone()));return x}).catch(()=>caches.match(r)));
});
