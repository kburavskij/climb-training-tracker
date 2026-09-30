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

const manifest = JSON.parse(manifestSource);
const catalog = JSON.parse(catalogSource);
assert.equal(typeof manifest.name, 'string', 'manifest name is required');
assert.equal(typeof manifest.short_name, 'string', 'manifest short_name is required');
assert.equal(typeof manifest.start_url, 'string', 'manifest start_url is required');
assert.equal(typeof manifest.scope, 'string', 'manifest scope is required');
assert.ok(['standalone', 'fullscreen', 'minimal-ui'].includes(manifest.display), 'manifest should be installable');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest should provide app icons');

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

console.log(`Static audit passed: ${inlineScripts.length} inline script, ${localReferences.size} local references, ${catalog.exercises.length} catalog exercises.`);
