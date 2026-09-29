'use strict';

const CACHE_PREFIX = 'crux-routine-';
const WORKER_VERSION = 'v3';
const CACHE_NAME = `${CACHE_PREFIX}${WORKER_VERSION}`;
const ROOT_URL = new URL('./', self.location.href).href;
const INDEX_URL = new URL('index.html', ROOT_URL).href;
const DEMO_ASSETS = [
  'worlds-greatest-stretch',
  'scapular-pull-up',
  'push-up',
  'split-squat',
  'dead-bug',
  'arm-circles'
].flatMap(slug => [1, 2, 3].map(frame => `demos/workout-guide/${slug}/frame-${frame}.svg`));
const APP_SHELL = [
  ROOT_URL,
  INDEX_URL,
  new URL('manifest.webmanifest', ROOT_URL).href,
  new URL('icons/icon-192.png', ROOT_URL).href,
  new URL('icons/icon-512.png', ROOT_URL).href,
  new URL('icons/apple-touch-icon.png', ROOT_URL).href,
  ...DEMO_ASSETS.map(path => new URL(path, ROOT_URL).href)
];
const SHELL_URLS = new Set(APP_SHELL);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(
      APP_SHELL.map(url => new Request(url, {cache: 'reload'}))
    ))
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

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (request.mode === 'navigate') {
      const appShell = await cache.match(INDEX_URL);
      if (appShell) return appShell;
      return fetch(request);
    }

    const shellUrl = new URL(url.href);
    shellUrl.search = '';
    if (SHELL_URLS.has(shellUrl.href)) {
      const cached = await cache.match(shellUrl.href);
      if (cached) return cached;
      return fetch(request);
    }

    try {
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); }
        catch (error) { console.warn('Could not refresh cached resource:', url.pathname, error); }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      return Response.error();
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const fallback = new URL('./#today', self.registration.scope);
  const scope = new URL(self.registration.scope);
  let target = fallback;
  try {
    const candidate = new URL(event.notification.data?.target || fallback.href, scope);
    if (candidate.origin === scope.origin && candidate.pathname.startsWith(scope.pathname)) target = candidate;
  } catch (_) {}

  event.waitUntil((async () => {
    const windows = await clients.matchAll({type: 'window', includeUncontrolled: true});
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (existing) {
      existing.postMessage({type: 'OPEN_SCHEDULE_TARGET', target: target.href});
      return existing.focus();
    }
    return clients.openWindow(target.href);
  })());
});
