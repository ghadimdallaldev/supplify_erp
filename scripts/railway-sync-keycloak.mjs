#!/usr/bin/env node
/**
 * Push deploy/railway/<env>/keycloak.env to the Railway Keycloak service (one command).
 *
 * Prerequisites:
 *   npm i -g @railway/cli   (or brew install railway)
 *   railway login
 *   railway link            (pick project + environment once)
 *
 * Usage:
 *   node scripts/railway-sync-keycloak.mjs development
 *   node scripts/railway-sync-keycloak.mjs development --service keycloak-dev
 *   pnpm railway:keycloak:sync -- preprod --service Keycloak-preprod
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const ENVS = new Set(['development', 'preprod', 'staging', 'production']);

function usage() {
  console.error(`Usage: pnpm railway:keycloak:sync -- <env> [--service <railway-service-name>]`);
  console.error(`  env: ${[...ENVS].join(' | ')}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let service = process.env.RAILWAY_KEYCLOAK_SERVICE || null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--service') {
      service = argv[i + 1];
      i += 1;
    } else {
      positional.push(argv[i]);
    }
  }
  const env = positional[0];
  if (!env || !ENVS.has(env)) usage();
  return { env, service };
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function railway(args) {
  return execFileSync('railway', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function main() {
  const { env, service } = parseArgs(process.argv.slice(2));
  const envFile = resolve(root, `deploy/railway/${env}/keycloak.env`);
  if (!existsSync(envFile)) {
    console.error(`Missing ${envFile}`);
    process.exit(1);
  }

  try {
    execFileSync('railway', ['--version'], { stdio: 'ignore' });
  } catch {
    console.error('Railway CLI not found. Install: npm i -g @railway/cli');
    process.exit(1);
  }

  const vars = parseEnvFile(readFileSync(envFile, 'utf8'));
  const password = process.env.KEYCLOAK_ADMIN_PASSWORD;
  if (password) {
    vars.KEYCLOAK_ADMIN_PASSWORD = password;
  } else if (!vars.KEYCLOAK_ADMIN_PASSWORD) {
    console.warn('Tip: set KEYCLOAK_ADMIN_PASSWORD in the shell when syncing secrets.');
  }

  const args = ['variables', '--set'];
  if (service) args.push('--service', service);
  for (const [key, value] of Object.entries(vars)) {
    args.push(`${key}=${value}`);
  }

  console.log(`Syncing ${Object.keys(vars).length} variables from ${envFile}`);
  if (service) console.log(`Service: ${service}`);

  const result = spawnSync('railway', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error('\nFailed. Run `railway link` in this repo if the project is not linked.');
    process.exit(result.status ?? 1);
  }

  console.log('\nDone. Redeploy the Keycloak service (or push to git if auto-deploy is on).');
  console.log('Confirm Settings → Source: GitHub + deploy/railway/' + env + '/keycloak/railway.json');
}

main();
