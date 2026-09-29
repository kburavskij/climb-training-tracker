'use strict';

const CACHE_PREFIX = 'crux-routine-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const ROOT_URL = new URL('./', self.location.href).href;
const INDEX_URL = new URL('index.html', ROOT_URL).href;
const APP_SHELL = [
  ROOT_URL,
  INDEX_URL,
  new URL('manifest.webmanifest', ROOT_URL).href,
  new URL('icons/icon-192.png', ROOT_URL).href,
  new URL('icons/icon-512.png', ROOT_URL).href,
  new URL('icons/apple-touch-icon.png', ROOT_URL).href
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (request.mode === 'navigate') {
        const appShell = await caches.match(INDEX_URL);
        if (appShell) return appShell;
      }

      return Response.error();
    }
  })());
});
