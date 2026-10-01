'use strict';

const CACHE_PREFIX = 'crux-routine-';
const WORKER_VERSION = 'v12';
const CACHE_NAME = `${CACHE_PREFIX}${WORKER_VERSION}`;
const PENDING_SHELL_CACHE = `${CACHE_PREFIX}pending-shell`;
const MEDIA_CACHE_PREFIX = 'crux-exercise-media-';
const DATASET_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd';
const MEDIA_CACHE_NAME = `${MEDIA_CACHE_PREFIX}${DATASET_COMMIT.slice(0, 12)}`;
const MEDIA_CACHE_MAX_ENTRIES = 48;
const ROOT_URL = new URL('./', self.location.href).href;
const INDEX_URL = new URL('index.html', ROOT_URL).href;
const DATASET_MEDIA_ORIGIN = 'https://raw.githubusercontent.com';
const DATASET_MEDIA_PREFIX = `/hasaneyldrm/exercises-dataset/${DATASET_COMMIT}/`;
const APP_SHELL = [
  ROOT_URL,
  INDEX_URL,
  new URL('manifest.webmanifest', ROOT_URL).href,
  new URL('exercise-catalog.json', ROOT_URL).href,
  new URL('icons/icon-192-v2.png', ROOT_URL).href,
  new URL('icons/icon-512-v2.png', ROOT_URL).href,
  new URL('icons/icon-maskable-512-v2.png', ROOT_URL).href,
  new URL('icons/apple-touch-icon-v2.png', ROOT_URL).href
];
const SHELL_URLS = new Set(APP_SHELL);

function isDatasetMediaUrl(url) {
  return url.origin === DATASET_MEDIA_ORIGIN
    && url.pathname.startsWith(DATASET_MEDIA_PREFIX)
    && /\.(?:gif|jpe?g|png|webp)$/i.test(url.pathname);
}

async function trimMediaCache(cache) {
  const keys = await cache.keys();
  const overflow = keys.length - MEDIA_CACHE_MAX_ENTRIES;
  if (overflow > 0) await Promise.all(keys.slice(0, overflow).map(key => cache.delete(key)));
}

async function handleDatasetMediaRequest(request) {
  const cache = await caches.open(MEDIA_CACHE_NAME);
  const cached = await cache.match(request, {ignoreVary: true});
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      try {
        await cache.put(request, response.clone());
        await trimMediaCache(cache);
      } catch (error) {
        console.warn('Could not cache exercise media:', new URL(request.url).pathname, error);
      }
    }
    return response;
  } catch (error) {
    return Response.error();
  }
}

async function stageLatestAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const current = await cache.match(INDEX_URL);
  const updateUrl = new URL(INDEX_URL);
  updateUrl.searchParams.set('update-check', String(Date.now()));
  const response = await fetch(new Request(updateUrl.href, { cache: 'no-store' }));
  if (!response.ok) throw new Error(`App shell request failed with ${response.status}`);

  const [currentText, latestText] = await Promise.all([
    current ? current.text() : Promise.resolve(''),
    response.clone().text()
  ]);
  if (currentText === latestText) {
    await caches.delete(PENDING_SHELL_CACHE);
    return false;
  }

  const pending = await caches.open(PENDING_SHELL_CACHE);
  await Promise.all([
    pending.put(INDEX_URL, response.clone()),
    pending.put(ROOT_URL, response.clone())
  ]);
  return true;
}

async function applyStagedAppShell() {
  const pending = await caches.open(PENDING_SHELL_CACHE);
  const current = await caches.open(CACHE_NAME);
  const keys = await pending.keys();
  if (!keys.length) return false;
  await Promise.all(keys.map(async request => {
    const response = await pending.match(request);
    if (response) await current.put(request, response);
  }));
  await caches.delete(PENDING_SHELL_CACHE);
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.map(url => new Request(url, {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => (
            (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== PENDING_SHELL_CACHE)
            || (key.startsWith(MEDIA_CACHE_PREFIX) && key !== MEDIA_CACHE_NAME)
          ))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (event.data?.type === 'CHECK_APP_SHELL_UPDATE') {
    event.waitUntil((async () => {
      try {
        const available = await stageLatestAppShell();
        event.ports[0]?.postMessage({ type: 'APP_SHELL_UPDATE_RESULT', available });
      } catch (error) {
        event.ports[0]?.postMessage({ type: 'APP_SHELL_UPDATE_RESULT', available: false, error: 'network' });
      }
    })());
    return;
  }

  if (event.data?.type === 'APPLY_APP_SHELL_UPDATE') {
    event.waitUntil((async () => {
      try {
        const applied = await applyStagedAppShell();
        event.ports[0]?.postMessage({ type: 'APP_SHELL_UPDATE_APPLIED', applied });
      } catch (error) {
        event.ports[0]?.postMessage({ type: 'APP_SHELL_UPDATE_APPLIED', applied: false, error: 'cache' });
      }
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (isDatasetMediaUrl(url)) {
    event.respondWith(handleDatasetMediaRequest(request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    if (request.mode === 'navigate') {
      let networkResponse = null;
      try {
        networkResponse = await fetch(new Request(request, {cache: 'no-store'}));
        if (networkResponse.ok) {
          try {
            await Promise.all([
              cache.put(INDEX_URL, networkResponse.clone()),
              cache.put(ROOT_URL, networkResponse.clone())
            ]);
          } catch (error) {
            console.warn('Could not refresh the offline app shell:', error);
          }
          return networkResponse;
        }
      } catch (_) {}

      const appShell = await cache.match(INDEX_URL) || await cache.match(ROOT_URL);
      if (appShell) return appShell;
      return networkResponse || Response.error();
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
