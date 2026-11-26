const CACHE='spektrum-a1-shell-2-11-2';
const SHELL=['./','./index.html','./styles.css','./app.js','./state-sync.js','./data/content.js','./data/study-banks.js','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('spektrum-a1-shell-')&&key!==CACHE).map(key=>caches.delete(key))))));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // Progress requests and external sync APIs must always reach the network.
  if(request.method!=='GET'||url.origin!==location.origin||url.search||url.pathname.endsWith('/data/user-progress.json'))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok&&response.status===200){
      event.waitUntil(cache.put(request,response.clone()).catch(()=>{}));
    }
    return response;
  }));
});
