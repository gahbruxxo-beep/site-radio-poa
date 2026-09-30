name=public/sw.js
'use strict';

const CACHE_NAME = 'webradio-cache-v2';
const ASSETS = [
  '/',
  '/admin',
  '/css/style.css',
  '/js/app.js',
  '/js/admin.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Não faz cache de requisições de API ou streaming
  if (url.pathname.startsWith('/api/') || url.hostname !== location.hostname) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) {
        // Atualiza o cache em segundo plano (stale-while-revalidate)
        fetch(e.request).then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, res));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(e.request).then((res) => {
        const resClone = res.clone();
        if (res.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        }
        return res;
      });
    })
  );
});