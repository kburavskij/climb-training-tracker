#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_REPOSITORY = 'https://github.com/hasaneyldrm/exercises-dataset';
const SOURCE_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd';
const MEDIA_ROOT = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/${SOURCE_COMMIT}/`;
const ATTRIBUTION = '© Gym visual, https://gymvisual.com/';
const STARTER_IDS = ['1604', '0688', '0662', '2368', '0276', '1428', '0721', '1271'];
const PREFERRED_DUPLICATES = new Set(['0126', '1471', '0499', '0514', '0659', '0697', '2802']);

const inputPath = process.argv[2];
const outputPath = process.argv[3] || 'exercise-catalog.json';
if (!inputPath) {
  console.error('Usage: node scripts/build-exercise-catalog.mjs source-exercises.json [output.json]');
  process.exit(2);
}

const source = JSON.parse(await readFile(inputPath, 'utf8'));
if (!Array.isArray(source)) throw new Error('Expected the upstream JSON root to be an array.');

function normalizedName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\((?:male|female|back pov|side pov)\)/g, ' ')
    .replace(/\bv\.\s*\d+\b/g, ' ')
    .replace(/\b(?:male|female)\s*$/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRelevant(item) {
  const name = item.name || '';
  return item.equipment === 'body weight'
    || /\bstretch(?:es|ing|ed)?\b|yoga pose/i.test(name)
    || item.equipment === 'band'
    || item.equipment === 'resistance band'
    || item.equipment === 'roller'
    || item.body_part === 'lower arms'
    || /\brope climb\b|^(?:weighted|assisted|lever assisted).*(?:pull[- ]?up|chin[- ]?up|muscle[- ]?up)/i.test(name);
}

function genderHint(name) {
  if (/\bfemale\b/i.test(name)) return 'female';
  if (/\bmale\b/i.test(name)) return 'male';
  return 'unspecified';
}

function preference(item) {
  if (PREFERRED_DUPLICATES.has(item.id)) return 100;
  return genderHint(item.name) === 'male' ? 30 : genderHint(item.name) === 'unspecified' ? 20 : 10;
}

function tagsFor(item) {
  const name = item.name.toLowerCase();
  const tags = new Set();
  if (item.equipment === 'body weight') tags.add('bodyweight');
  if (['band', 'resistance band'].includes(item.equipment)) tags.add('band');
  if (/stretch|yoga pose|ankle circles|wrist circles/.test(name)) tags.add('mobility');
  if (item.body_part === 'cardio') tags.add('conditioning');
  if (item.body_part === 'lower arms' || item.target === 'forearms') tags.add('finger-care');
  if (item.body_part === 'waist') tags.add('core');
  if (item.body_part === 'chest' || ['pectorals', 'triceps', 'serratus anterior'].includes(item.target)) tags.add('antagonist');
  if (/pull[- ]?up|chin[- ]?up|hang|row|scapul|rope climb|muscle[- ]?up|front lever|back lever/.test(name)
      || item.body_part === 'lower arms') tags.add('climbing');
  if (!tags.has('mobility') && item.body_part !== 'cardio') tags.add('strength');
  return [...tags];
}

const selected = source.filter(isRelevant);
const deduped = new Map();
for (const item of selected) {
  const key = [normalizedName(item.name), item.equipment, item.body_part, item.target].join('|');
  const existing = deduped.get(key);
  if (!existing || preference(item) > preference(existing)) deduped.set(key, item);
}

const exercises = [...deduped.values()]
  .map(item => ({
    id: item.id,
    name: item.name,
    bodyPart: item.body_part,
    equipment: item.equipment,
    target: item.target,
    muscleGroup: item.muscle_group || '',
    secondaryMuscles: Array.isArray(item.secondary_muscles) ? item.secondary_muscles : [],
    instructions: item.instructions?.en || '',
    steps: Array.isArray(item.instruction_steps?.en) ? item.instruction_steps.en : [],
    image: new URL(item.image, MEDIA_ROOT).href,
    gif: new URL(item.gif_url, MEDIA_ROOT).href,
    attribution: item.attribution || ATTRIBUTION,
    genderHint: genderHint(item.name),
    tags: tagsFor(item)
  }))
  .sort((a, b) => {
    const starterA = STARTER_IDS.indexOf(a.id);
    const starterB = STARTER_IDS.indexOf(b.id);
    if (starterA >= 0 || starterB >= 0) return (starterA < 0 ? 999 : starterA) - (starterB < 0 ? 999 : starterB);
    const genderOrder = { male: 0, unspecified: 1, female: 2 };
    return genderOrder[a.genderHint] - genderOrder[b.genderHint] || a.name.localeCompare(b.name, 'en');
  });

const output = {
  source: {
    repository: SOURCE_REPOSITORY,
    commit: SOURCE_COMMIT,
    language: 'en',
    attribution: ATTRIBUTION,
    provenance: 'ExerciseDB v1 / AscendAPI (as documented in the upstream repository history)',
    provenanceUrl: 'https://oss.exercisedb.dev/swagger',
    mediaNotice: 'Third-party Gym visual media stays at its source resolution and is loaded only on demand. Review the upstream media terms.'
  },
  starterIds: STARTER_IDS,
  exercises
};

await writeFile(path.resolve(outputPath), `${JSON.stringify(output)}\n`);
console.log(`Wrote ${exercises.length} English exercises to ${outputPath}.`);
