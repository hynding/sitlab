#!/usr/bin/env node
/**
 * Runs conformance/fixtures/*.json against both running CMS apps and compares them.
 *
 *   node conformance/run.mjs                 both backends (start them first)
 *   node conformance/run.mjs --only php      one backend
 *   node conformance/run.mjs stories-crud    only fixtures whose file name contains this
 *
 * Environment:
 *   CMS_PHP_URL   default http://localhost:1337   (apps/cms-php, strapi-php)
 *   CMS_NODE_URL  default http://localhost:1338   (apps/cms-node, Strapi)
 *   CONFORMANCE_ADMIN_EMAIL / CONFORMANCE_ADMIN_PASSWORD
 *                 an admin of both apps. On a fresh database the first run registers it.
 *
 * Each fixture is a list of steps: `request` (method, path, body), `expect` (status, body) and
 * optional `save` ({ name: "data.documentId" }) to reuse a value later as {{name}}. {{run}} is
 * unique per run, so fixtures can filter to their own rows. Matching rules are those of
 * strapi-php's examples/plugins/announcements runner:
 *   objects  every expected key must match; extra keys are allowed unless `"$keys"` lists them all
 *   arrays   same length, matched element by element
 *   scalars  strict equality
 *
 * Besides `expect`, every step's response is compared between the two backends, with ids,
 * document ids and timestamps masked. A difference there is a strapi-php bug (or an upstream
 * quirk worth writing down) even when both pass `expect`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const args = process.argv.slice(2);
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? args.splice(onlyIndex, 2)[1] : null;
const filter = args[0] ?? '';

const backends = Object.entries({
  php: process.env.CMS_PHP_URL ?? 'http://localhost:1337',
  node: process.env.CMS_NODE_URL ?? 'http://localhost:1338',
})
  .filter(([name]) => !only || name === only)
  .map(([name, url]) => ({ name, url: url.replace(/\/$/, '') }));

const admin = {
  email: process.env.CONFORMANCE_ADMIN_EMAIL ?? 'admin@sitlab.local',
  password: process.env.CONFORMANCE_ADMIN_PASSWORD ?? 'Sitlab-conformance-1',
};
const run = Date.now().toString(36);

// --- auth: an admin session, then a full-access API token for the content API -------------------

async function json(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function connect(backend) {
  const init = await json(`${backend.url}/admin/init`).catch((e) => {
    throw new Error(`${backend.name}: ${backend.url} is not reachable (${e.cause?.code ?? e.message}). Is the app running?`);
  });
  const path = init.body?.data?.hasAdmin ? 'login' : 'register-admin';
  const body = path === 'login' ? admin : { ...admin, firstname: 'Conformance', lastname: 'Runner' };
  const session = await json(`${backend.url}/admin/${path}`, { method: 'POST', body: JSON.stringify(body) });
  const adminJwt = session.body?.data?.token ?? session.body?.data?.accessToken;
  if (!adminJwt) {
    throw new Error(`${backend.name}: admin ${path} failed (${session.status}); set CONFORMANCE_ADMIN_EMAIL/PASSWORD to an admin of this app`);
  }
  const token = await json(`${backend.url}/admin/api-tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminJwt}` },
    body: JSON.stringify({ name: `conformance-${backend.name}-${run}`, type: 'full-access', lifespan: null, description: 'conformance/run.mjs, deleted after the run' }),
  });
  if (!token.body?.data?.accessKey) throw new Error(`${backend.name}: could not create an API token (${token.status}) ${JSON.stringify(token.body)}`);
  backend.adminJwt = adminJwt;
  backend.tokenId = token.body.data.id;
  backend.apiToken = token.body.data.accessKey;
}

async function disconnect(backend) {
  if (backend.tokenId === undefined) return;
  await json(`${backend.url}/admin/api-tokens/${backend.tokenId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${backend.adminJwt}` } });
}

// --- fixture machinery --------------------------------------------------------------------------

function substitute(value, vars) {
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{(\w+)\}\}$/);
    if (whole && whole[1] in vars) return vars[whole[1]];
    return value.replace(/\{\{(\w+)\}\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  return value;
}

function pick(body, path) {
  return path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), body);
}

function match(expected, actual, path = 'body') {
  if (expected === null || typeof expected !== 'object') {
    return Object.is(expected, actual) ? [] : [`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${path}: expected an array, got ${JSON.stringify(actual)}`];
    if (expected.length !== actual.length) return [`${path}: expected ${expected.length} items, got ${actual.length}`];
    return expected.flatMap((item, i) => match(item, actual[i], `${path}[${i}]`));
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return [`${path}: expected an object, got ${JSON.stringify(actual)}`];
  const problems = [];
  if (expected.$keys) {
    const want = [...expected.$keys].sort().join(',');
    const got = Object.keys(actual).sort().join(',');
    if (want !== got) problems.push(`${path}: expected keys ${want}, got ${got}`);
  }
  for (const [key, value] of Object.entries(expected)) {
    if (key === '$keys') continue;
    if (!(key in actual)) problems.push(`${path}.${key}: missing`);
    else problems.push(...match(value, actual[key], `${path}.${key}`));
  }
  return problems;
}

/** Masks what legitimately differs between two databases, so the rest can be compared. */
const VOLATILE = new Set(['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'accessedOn']);
function mask(value) {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, VOLATILE.has(k) && v !== null ? `<${k}>` : mask(v)]));
  }
  return value;
}

/** Differences between two JSON values, as `path: php … / node …` lines. */
function diff(a, b, path = 'body') {
  if (Object.is(a, b)) return [];
  const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (kind(a) !== kind(b) || kind(a) !== 'object' && kind(a) !== 'array') {
    return [`${path}: php ${JSON.stringify(a)} / node ${JSON.stringify(b)}`];
  }
  if (Array.isArray(a)) {
    if (a.length !== b.length) return [`${path}: php ${a.length} items / node ${b.length} items`];
    return a.flatMap((v, i) => diff(v, b[i], `${path}[${i}]`));
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.flatMap((k) => {
    if (!(k in a)) return [`${path}.${k}: missing on php (node ${JSON.stringify(b[k])})`];
    if (!(k in b)) return [`${path}.${k}: missing on node (php ${JSON.stringify(a[k])})`];
    return diff(a[k], b[k], `${path}.${k}`);
  });
}

async function runStep(backend, step, vars) {
  const request = substitute(step.request, vars);
  const res = await fetch(backend.url + request.path, {
    method: request.method,
    headers: {
      Accept: 'application/json',
      ...(step.auth === 'none' ? {} : { Authorization: `Bearer ${backend.apiToken}` }),
      ...(request.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function runFixture(fixture) {
  const vars = Object.fromEntries(backends.map((b) => [b.name, { run }]));
  const problems = [];
  for (const [i, step] of fixture.steps.entries()) {
    const label = `step ${i + 1} (${step.request.method} ${step.request.path})`;
    const results = {};
    for (const backend of backends) {
      const result = await runStep(backend, step, vars[backend.name]);
      results[backend.name] = result;
      const expect = substitute(step.expect, vars[backend.name]);
      if (result.status !== expect.status) problems.push(`${backend.name} ${label}: expected status ${expect.status}, got ${result.status} ${result.text.slice(0, 300)}`);
      if ('body' in expect) problems.push(...match(expect.body, result.body).map((p) => `${backend.name} ${label}: ${p}`));
      for (const [name, path] of Object.entries(step.save ?? {})) vars[backend.name][name] = pick(result.body, path);
    }
    if (results.php && results.node && !step.skipCompare) {
      if (results.php.status !== results.node.status) problems.push(`differ ${label}: status php ${results.php.status} / node ${results.node.status}`);
      problems.push(...diff(mask(results.php.body), mask(results.node.body)).map((d) => `differ ${label}: ${d}`));
    }
  }
  return problems;
}

// --- run ----------------------------------------------------------------------------------------

let failed = 0;
try {
  for (const backend of backends) await connect(backend);
  for (const file of readdirSync(fixturesDir).filter((f) => f.endsWith('.json') && f.includes(filter)).sort()) {
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    const problems = await runFixture(fixture);
    if (problems.length) {
      failed++;
      console.log(`FAIL ${file}: ${fixture.description}`);
      for (const p of problems) console.log(`     ${p}`);
    } else {
      console.log(`ok   ${file}: ${fixture.description}`);
    }
  }
} catch (e) {
  console.error(e.message);
  failed++;
} finally {
  for (const backend of backends) await disconnect(backend).catch(() => {});
}
console.log(failed ? `\n${failed} failing` : `\nall passing on ${backends.map((b) => b.name).join(' and ')}`);
process.exit(failed ? 1 : 0);
