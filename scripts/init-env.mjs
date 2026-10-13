#!/usr/bin/env node
/**
 * Creates apps/cms-php/.env and apps/cms-node/.env from their .env.example with fresh secrets,
 * as create-strapi-app does for a new project. An existing .env is left alone.
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

for (const app of ['apps/cms-php', 'apps/cms-node']) {
  const target = join(root, app, '.env');
  if (existsSync(target)) {
    console.log(`${app}/.env exists, left as is`);
    continue;
  }
  const env = readFileSync(join(root, app, '.env.example'), 'utf8').replace(/^(\w+)=.*$/gm, (line, key) =>
    key in secrets ? `${key}=${secrets[key]()}` : line,
  );
  writeFileSync(target, env);
  console.log(`${app}/.env created with fresh secrets`);
}
