#!/usr/bin/env node
/**
 * Copies the shared content model in schema/ into both CMS apps, so Strapi (Node) and
 * strapi-php serve the same content types.
 *
 *   node scripts/sync-schema.mjs           write schema/ into apps/cms-node and apps/cms-php
 *   node scripts/sync-schema.mjs --check   exit 1 if either app differs from schema/
 *   node scripts/sync-schema.mjs --pull php|node
 *                                           copy an app's schemas back into schema/ (after
 *                                           editing them in that app's Content-Type Builder)
 *
 * schema.json and component files are copied verbatim. Each content type also gets the default
 * core router, controller and service (.ts for Node, .php for PHP) when it has none, so custom
 * logic written later in either app is never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const schemaDir = join(root, 'schema');
const apps = {
  node: { dir: join(root, 'apps/cms-node/src'), ext: 'ts' },
  php: { dir: join(root, 'apps/cms-php/src'), ext: 'php' },
};

const boilerplate = {
  ts: (kind, uid) =>
    `/**\n * ${uid.split('.').pop()} ${kind}\n */\n\nimport { factories } from '@strapi/strapi';\n\nexport default factories.createCore${cap(kind)}('${uid}');\n`,
  php: (kind, uid) =>
    `<?php\n\ndeclare(strict_types=1);\n\n/**\n * ${uid.split('.').pop()} ${kind}\n */\n\nuse Strapi\\Core\\Factories;\n\nreturn Factories::createCore${cap(kind)}('${uid}');\n`,
};
const layers = { routes: 'router', controllers: 'controller', services: 'service' };

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

/** Every schema file under a src-shaped directory, as paths relative to it. */
function schemaFiles(base) {
  const files = [];
  const apiDir = join(base, 'api');
  if (existsSync(apiDir)) {
    for (const api of readdirSync(apiDir)) {
      const ctDir = join(apiDir, api, 'content-types');
      if (!existsSync(ctDir)) continue;
      for (const ct of readdirSync(ctDir)) {
        if (existsSync(join(ctDir, ct, 'schema.json'))) files.push(join('api', api, 'content-types', ct, 'schema.json'));
      }
    }
  }
  const compDir = join(base, 'components');
  if (existsSync(compDir)) {
    for (const category of readdirSync(compDir)) {
      if (!existsSync(join(compDir, category)) || category.startsWith('.')) continue;
      for (const file of readdirSync(join(compDir, category))) {
        if (file.endsWith('.json')) files.push(join('components', category, file));
      }
    }
  }
  return files.sort();
}

/** JSON compared by value, so key order and whitespace from the Content-Type Builder don't count. */
function sameJson(a, b) {
  const norm = (v) =>
    Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v;
  return JSON.stringify(norm(JSON.parse(a))) === JSON.stringify(norm(JSON.parse(b)));
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const [mode, from] = process.argv.slice(2);

if (mode === '--pull') {
  const app = apps[from];
  if (!app) {
    console.error('usage: sync-schema.mjs --pull php|node');
    process.exit(2);
  }
  for (const file of schemaFiles(app.dir)) write(join(schemaDir, file), readFileSync(join(app.dir, file), 'utf8'));
  console.log(`schema/ updated from ${relative(root, app.dir)}; run without flags to copy it to the other app`);
  process.exit(0);
}

const shared = schemaFiles(schemaDir);
const problems = [];

for (const [name, app] of Object.entries(apps)) {
  const inApp = new Set(schemaFiles(app.dir));
  for (const file of shared) {
    const source = readFileSync(join(schemaDir, file), 'utf8');
    const target = join(app.dir, file);
    if (mode === '--check') {
      if (!existsSync(target)) problems.push(`${name}: missing ${file}`);
      else if (!sameJson(source, readFileSync(target, 'utf8'))) problems.push(`${name}: ${file} differs from schema/`);
    } else {
      write(target, source);
    }
    inApp.delete(file);

    const match = file.match(/^api\/([^/]+)\/content-types\/([^/]+)\/schema\.json$/);
    if (!match) continue;
    const [, api, ct] = match;
    for (const [layer, kind] of Object.entries(layers)) {
      const path = join(app.dir, 'api', api, layer, `${ct}.${app.ext}`);
      if (existsSync(path)) continue;
      if (mode === '--check') problems.push(`${name}: missing ${relative(app.dir, path)}`);
      else write(path, boilerplate[app.ext](kind, `api::${api}.${ct}`));
    }
  }
  for (const extra of inApp) problems.push(`${name}: ${extra} is not in schema/ (pull it with --pull ${name})`);
}

if (problems.length) {
  for (const p of problems) console.error(p);
  process.exit(1);
}
console.log(mode === '--check' ? 'schema/ and both apps agree' : `synced ${shared.length} schema files into apps/cms-node and apps/cms-php`);
