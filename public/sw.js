// Service worker do Casa Mia: só para o modo loja abrir com sinal ruim (Fase 11.6). Guarda a casca do app (/app) e os
// arquivos com hash do build; nunca guarda respostas da API, que dependem de quem está conectado.
const CACHE = "casamia-shell-__STORE_BUILD__";
const SHELL = "/app";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const manifest = await fetch('/store-offline-assets.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Offline asset manifest unavailable');
      return response.json();
    });
    await cache.addAll([new Request(SHELL, { cache: 'reload' }), ...manifest.assets.map(asset => new Request(asset, { cache: 'reload' }))]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('casamia-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname === "/ingest" || url.pathname.startsWith("/ingest/")) return;

  // Telas do app: rede primeiro; sem rede, a última casca guardada (o app abre o retrato salvo do modo loja).
  if (request.mode === "navigate") {
    if (!url.pathname.startsWith("/app")) return;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(SHELL, copy)));
          }
          return response;
        })
        .catch(() => caches.open(CACHE).then(cache => cache.match(SHELL)).then((cached) => cached || Response.error())),
    );
    return;
  }

  // Arquivos do build têm hash no nome: o que está guardado nunca muda.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE).then(cache => cache.match(request)).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          }),
      ),
    );
  }
});
