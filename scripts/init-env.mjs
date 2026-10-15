#!/usr/bin/env node
/**
 * Creates apps/cms-php/.env and apps/cms-node/.env from their .env.example with fresh secrets,
 * as create-strapi-app does for a new project. An existing .env is left alone.
 *
 * `--deploy dev` or `--deploy production` instead writes apps/cms-php/.env.dev or .env.production
 * (the server's .env, stored as the ENV_FILE secret) from .env.deploy.example, with fresh secrets and
 * that environment's URL and database. Only the database username and password are left to fill in.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const secret = () => randomBytes(16).toString('base64');
const secrets = {
  APP_KEYS: () => `"${[secret(), secret(), secret(), secret()].join(',')}"`,
  API_TOKEN_SALT: secret,
  ADMIN_JWT_SECRET: secret,
  TRANSFER_TOKEN_SALT: secret,
  JWT_SECRET: secret,
  ENCRYPTION_KEY: secret,
};

const fill = (template, values = {}) =>
  template.replace(/^(\w+)=.*$/gm, (line, key) =>
    key in values ? `${key}=${values[key]}` : key in secrets ? `${key}=${secrets[key]()}` : line,
  );

const deployments = {
  dev: { PUBLIC_URL: 'https://api-dev.sitlab.dev', DATABASE_NAME: 'sitlab_dev' },
  production: { PUBLIC_URL: 'https://api.sitlab.dev', DATABASE_NAME: 'sitlab_prod' },
};
const flag = process.argv.indexOf('--deploy');
if (flag !== -1) {
  const name = process.argv[flag + 1];
  if (!(name in deployments)) {
    console.error(`usage: node scripts/init-env.mjs --deploy ${Object.keys(deployments).join('|')}`);
    process.exit(1);
  }
  const target = join(root, 'apps/cms-php', `.env.${name}`);
  if (existsSync(target)) {
    console.error(`apps/cms-php/.env.${name} exists, left as is (its secrets must not change once deployed)`);
    process.exit(1);
  }
  const template = readFileSync(join(root, 'apps/cms-php/.env.deploy.example'), 'utf8');
  writeFileSync(target, fill(template, deployments[name]), { mode: 0o600 });
  console.log(`apps/cms-php/.env.${name} created with fresh secrets.`);
  console.log('Fill in DATABASE_USERNAME and DATABASE_PASSWORD, then:');
  console.log(`  gh secret set ENV_FILE --env ${name} < apps/cms-php/.env.${name}`);
  process.exit(0);
}

for (const app of ['apps/cms-php', 'apps/cms-node']) {
  const target = join(root, app, '.env');
  if (existsSync(target)) {
    console.log(`${app}/.env exists, left as is`);
    continue;
  }
  const env = fill(readFileSync(join(root, app, '.env.example'), 'utf8'));
  writeFileSync(target, env);
  console.log(`${app}/.env created with fresh secrets`);
}
