import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testsDir, '..');
const readText = relativePath => readFile(path.join(root, relativePath), 'utf8');

const [html, workerSource, manifestSource, catalogSource] = await Promise.all([
  readText('index.html'),
  readText('service-worker.js'),
  readText('manifest.webmanifest'),
  readText('exercise-catalog.json')
]);

const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
  .map(([, , source]) => source);

assert.ok(inlineScripts.length > 0, 'index.html should contain executable JavaScript');
inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: `index.html:inline-script-${index + 1}.js` });
});
new vm.Script(workerSource, { filename: 'service-worker.js' });

const appVersion = html.match(/\bconst APP_VERSION = ['"]([^'"]+)['"]/)?.[1];
const displayedAppVersion = html.match(/id=["']pwa-update-status["'][^>]*>Version ([\d.]+)/)?.[1];
const workerVersion = workerSource.match(/\bconst WORKER_VERSION = ['"]([^'"]+)['"]/)?.[1];
assert.equal(appVersion, '4.6', 'application release constant should be current');
assert.equal(displayedAppVersion, appVersion, 'visible application version should match its release constant');
assert.equal(workerVersion, 'v10', 'service-worker cache release should match app 4.6');
assert.ok(workerSource.includes('const CACHE_NAME = `${CACHE_PREFIX}${WORKER_VERSION}`'), 'app-shell cache should derive from the worker release');

function createWorkerHarness({ addAllError = null, cacheKeys = [] } = {}) {
  const handlers = new Map();
  const events = [];
  const cache = {
    async addAll(requests) {
      events.push(`precache:${requests.length}`);
      if (addAllError) throw addAllError;
    },
    async match() { return undefined; },
    async put() {}
  };
  const sandbox = {
    URL,
    Request,
    Response,
    console,
    fetch: async () => { throw new Error('network is not available in the lifecycle harness'); },
    caches: {
      async open(name) { events.push(`open:${name}`); return cache; },
      async keys() { return cacheKeys; },
      async delete(name) { events.push(`delete:${name}`); return true; },
      async match() { return undefined; }
    },
    self: {
      location: { href: 'https://app.test/service-worker.js', origin: 'https://app.test' },
      registration: { scope: 'https://app.test/' },
      clients: {
        async claim() { events.push('claim'); },
        async matchAll() { return []; },
        async openWindow() {}
      },
      async skipWaiting() { events.push('skipWaiting'); },
      addEventListener(type, listener) { handlers.set(type, listener); }
    }
  };
  vm.createContext(sandbox);
  new vm.Script(workerSource, { filename: 'service-worker-lifecycle.js' }).runInContext(sandbox);
  const dispatch = type => {
    let completion;
    handlers.get(type)({ waitUntil(promise) { completion = Promise.resolve(promise); } });
    assert.ok(completion, `${type} listener should extend its lifecycle`);
    return completion;
  };
  return { dispatch, events };
}

const successfulInstall = createWorkerHarness();
await successfulInstall.dispatch('install');
assert.ok(successfulInstall.events[0] === 'open:crux-routine-v10', 'install should open the current app-shell cache first');
assert.ok(successfulInstall.events.some(event => event.startsWith('precache:')), 'install should precache the complete app shell');
assert.ok(
  successfulInstall.events.indexOf('skipWaiting') > successfulInstall.events.findIndex(event => event.startsWith('precache:')),
  'install should skip waiting only after the app shell is precached'
);

const failedInstall = createWorkerHarness({ addAllError: new Error('fixture precache failure') });
await assert.rejects(failedInstall.dispatch('install'), /fixture precache failure/);
assert.ok(!failedInstall.events.includes('skipWaiting'), 'a failed precache must leave the installed worker in control');

const currentMediaCache = 'crux-exercise-media-7455efae41b3';
const activation = createWorkerHarness({
  cacheKeys: ['crux-routine-v9', 'crux-routine-v10', 'crux-exercise-media-old', currentMediaCache, 'unrelated-cache']
});
await activation.dispatch('activate');
assert.deepEqual(
  activation.events.filter(event => event.startsWith('delete:')).sort(),
  ['delete:crux-exercise-media-old', 'delete:crux-routine-v9'],
  'activation should delete only stale app and exercise-media caches'
);
assert.equal(activation.events.at(-1), 'claim', 'the current worker should claim clients after cache cleanup');

const navigationBranch = workerSource.match(/if \(request\.mode === ['"]navigate['"]\) \{([\s\S]*?)\n    \}\n\n    const shellUrl/)?.[1] || '';
assert.match(navigationBranch, /fetch\(new Request\(request, \{cache: ['"]no-store['"]\}\)\)/, 'navigations should bypass the HTTP cache');
assert.ok(
  navigationBranch.indexOf('fetch(new Request') < navigationBranch.indexOf('cache.match(INDEX_URL)'),
  'navigations should try the network before the cached shell'
);
assert.match(navigationBranch, /cache\.put\(INDEX_URL, networkResponse\.clone\(\)\)/, 'fresh navigation HTML should replace cached index.html');
assert.match(navigationBranch, /cache\.put\(ROOT_URL, networkResponse\.clone\(\)\)/, 'fresh navigation HTML should replace the cached root shell');
assert.match(navigationBranch, /cache\.match\(INDEX_URL\) \|\| await cache\.match\(ROOT_URL\)/, 'failed navigations should fall back to the cached app shell');

const manifest = JSON.parse(manifestSource);
const catalog = JSON.parse(catalogSource);
assert.equal(typeof manifest.name, 'string', 'manifest name is required');
assert.equal(typeof manifest.short_name, 'string', 'manifest short_name is required');
assert.equal(typeof manifest.start_url, 'string', 'manifest start_url is required');
assert.equal(typeof manifest.scope, 'string', 'manifest scope is required');
assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), 'manifest should be installable');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest should provide app icons');
assert.ok(manifest.icons.every(icon => /-v\d+\.png$/.test(icon.src)), 'every manifest icon should have a versioned filename');
assert.deepEqual(
  manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
  [
    { src: './icons/icon-192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: './icons/icon-maskable-512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  'manifest should expose the supplied artwork at install and maskable sizes'
);

const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => match[0]);
const linkAttribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1];
const findLink = relation => linkTags.find(tag => (linkAttribute(tag, 'rel') || '').split(/\s+/).includes(relation));
const appleTouchIcon = findLink('apple-touch-icon');
const favicon = findLink('icon');
assert.equal(linkAttribute(appleTouchIcon || '', 'href'), './icons/apple-touch-icon-v2.png', 'iPhone home-screen icon should use a cache-busted copy of the supplied artwork');
assert.match(linkAttribute(appleTouchIcon || '', 'href'), /-v\d+\.png$/, 'iPhone home-screen icon should have a versioned filename');
assert.equal(linkAttribute(appleTouchIcon || '', 'sizes'), '180x180', 'iPhone home-screen icon should declare 180x180');
assert.equal(linkAttribute(favicon || '', 'href'), './icons/icon-192-v2.png', 'browser icon should use a cache-busted copy of the supplied artwork');
assert.match(linkAttribute(favicon || '', 'href'), /-v\d+\.png$/, 'browser icon should have a versioned filename');
assert.equal(linkAttribute(favicon || '', 'sizes'), '192x192', 'browser icon should declare its exact size');
const brandMarks = [...html.matchAll(/<div class="brand-mark"><img\b[^>]*\bsrc="([^"]+)"[^>]*><\/div>/g)];
assert.equal(brandMarks.length, 2, 'desktop and mobile headers should both show the climbing artwork');
assert.ok(brandMarks.every(match => match[1] === './icons/icon-192-v2.png'), 'header artwork should use the cache-busted icon');

assert.equal(catalog.source?.repository, 'https://github.com/hasaneyldrm/exercises-dataset');
assert.match(catalog.source?.commit || '', /^[a-f\d]{40}$/i, 'catalog source commit must be pinned');
assert.equal(catalog.source?.language, 'en', 'catalog should contain the English dataset');
assert.match(catalog.source?.attribution || '', /Gym visual/i, 'catalog media attribution is required');
assert.equal(catalog.exercises?.length, 451, 'catalog should contain the curated 451 exercises');
assert.ok(Array.isArray(catalog.starterIds) && catalog.starterIds.length === 8, 'catalog should identify eight starter exercises');

const catalogIds = new Set();
const mediaRoot = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${catalog.source.commit}/`;
for (const exercise of catalog.exercises) {
  assert.match(exercise.id || '', /^\d{4}$/, 'catalog exercise IDs must be four digits');
  assert.ok(!catalogIds.has(exercise.id), `duplicate catalog exercise ID: ${exercise.id}`);
  catalogIds.add(exercise.id);
  assert.ok(String(exercise.name || '').trim(), `catalog exercise ${exercise.id} needs a name`);
  assert.ok(String(exercise.instructions || '').trim(), `catalog exercise ${exercise.id} needs instructions`);
  assert.ok(Array.isArray(exercise.steps), `catalog exercise ${exercise.id} needs instruction steps`);
  assert.ok(Array.isArray(exercise.tags), `catalog exercise ${exercise.id} needs tags`);
  assert.ok(exercise.image?.startsWith(`${mediaRoot}images/`) && exercise.image.endsWith('.jpg'), `invalid catalog poster URL: ${exercise.id}`);
  assert.ok(exercise.gif?.startsWith(`${mediaRoot}videos/`) && exercise.gif.endsWith('.gif'), `invalid catalog animation URL: ${exercise.id}`);
  assert.match(exercise.attribution || '', /Gym visual/i, `catalog exercise ${exercise.id} needs media attribution`);
}
for (const starterId of catalog.starterIds) {
  assert.ok(catalogIds.has(starterId), `starter exercise is missing from catalog: ${starterId}`);
}
assert.ok(html.includes(catalog.source.commit), 'app and catalog must use the same pinned dataset commit');
assert.doesNotMatch(html, /data-action=["']toggle-demo-motion["']/, 'exercise media must not expose Play/Pause toggle actions');
assert.doesNotMatch(html, /demo-(?:play-badge|motion-toggle)/, 'removed exercise playback control classes must not return');
assert.doesNotMatch(html, /<symbol\b[^>]*\bid=["']i-(?:play|pause)["']/i, 'removed exercise playback icons must not return');
assert.match(workerSource, /exercise-catalog\.json/, 'offline shell should include the local exercise catalog');
assert.doesNotMatch(workerSource, /demos\/(?:workout-guide|quaternius)\//, 'obsolete generated demos should not be precached');
for (const iconPath of ['icons/icon-192-v2.png', 'icons/icon-512-v2.png', 'icons/icon-maskable-512-v2.png', 'icons/apple-touch-icon-v2.png']) {
  assert.ok(workerSource.includes(iconPath), `offline shell should include ${iconPath}`);
}

const staticHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

function localPathFromReference(reference) {
  const value = reference.trim();
  if (!value || value.startsWith('#') || value.startsWith('data:') || value.startsWith('//')) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;
  if (value.includes('${')) return null;
  const clean = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  return clean.replace(/^\.\//, '').replace(/^\//, '');
}

const localReferences = new Set();
for (const match of staticHtml.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  const localPath = localPathFromReference(match[1]);
  if (localPath) localReferences.add(localPath);
}
for (const match of staticHtml.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)) {
  const localPath = localPathFromReference(match[1]);
  if (localPath) localReferences.add(localPath);
}
localReferences.add('exercise-catalog.json');
for (const icon of manifest.icons) {
  assert.equal(typeof icon.src, 'string', 'every manifest icon needs a src');
  const localPath = localPathFromReference(icon.src);
  assert.ok(localPath, `manifest icon must be local: ${icon.src}`);
  localReferences.add(localPath);
}

for (const relativePath of localReferences) {
  const absolutePath = path.resolve(root, relativePath);
  assert.ok(
    absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`),
    `local reference escapes the repository: ${relativePath}`
  );
  const info = await stat(absolutePath).catch(() => null);
  assert.ok(info, `referenced asset is missing: ${relativePath}`);
}

const ids = [...staticHtml.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
assert.deepEqual(duplicateIds, [], `duplicate static IDs: ${duplicateIds.join(', ')}`);
const idSet = new Set(ids);
for (const match of staticHtml.matchAll(/<use\b[^>]*\bhref\s*=\s*["']#([^"']+)["']/gi)) {
  assert.ok(idSet.has(match[1]), `SVG use points to missing symbol #${match[1]}`);
}
for (const match of staticHtml.matchAll(/\bdata-view\s*=\s*["']([^"']+)["']/gi)) {
  assert.ok(idSet.has(`view-${match[1]}`), `navigation target #view-${match[1]} is missing`);
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  assert.equal(buffer.subarray(0, 8).toString('hex'), signature, 'invalid PNG signature');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const icon of manifest.icons) {
  const localPath = localPathFromReference(icon.src);
  const buffer = await readFile(path.join(root, localPath));
  if (icon.type === 'image/png' || localPath.endsWith('.png')) {
    const dimensions = pngDimensions(buffer);
    const declared = String(icon.sizes || '').match(/^(\d+)x(\d+)$/);
    assert.ok(declared, `manifest icon needs an exact size: ${localPath}`);
    assert.deepEqual(
      dimensions,
      { width: Number(declared[1]), height: Number(declared[2]) },
      `manifest size does not match ${localPath}`
    );
  }
}

for (const [localPath, expected] of [
  ['icons/apple-touch-icon-v2.png', { width: 180, height: 180 }],
  ['icons/icon-192-v2.png', { width: 192, height: 192 }]
]) {
  const dimensions = pngDimensions(await readFile(path.join(root, localPath)));
  assert.deepEqual(dimensions, expected, `HTML icon size does not match ${localPath}`);
}

console.log(`Static audit passed: ${inlineScripts.length} inline script, ${localReferences.size} local references, ${catalog.exercises.length} catalog exercises.`);
