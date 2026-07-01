#!/usr/bin/env node
/**
 * Push deploy/railway/<env>/api.env to the Railway API service.
 * Usage: node scripts/railway-sync-api.mjs preprod --service supplify-api-preprod
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const ENVS = new Set(['development', 'preprod', 'staging', 'production']);

const DEFAULT_SERVICES = {
  development: 'supplify-api-dev',
  preprod: 'supplify-api-preprod',
  staging: 'supplify-api-preprod',
  production: 'supplify-api-prod',
};

function usage() {
  console.error('Usage: node scripts/railway-sync-api.mjs <env> [--service <name>]');
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  let service = null;
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
  return { env, service: service || DEFAULT_SERVICES[env] };
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return vars;
}

function railwayBin() {
  return process.platform === 'win32' ? 'railway.cmd' : 'railway';
}

function main() {
  const { env, service } = parseArgs(process.argv.slice(2));
  const envFile = resolve(root, `deploy/railway/${env}/api.env`);
  if (!existsSync(envFile)) {
    console.error(`Missing ${envFile}`);
    process.exit(1);
  }

  const bin = railwayBin();
  try {
    execFileSync(bin, ['--version'], { stdio: 'ignore', shell: true });
  } catch {
    console.error('Railway CLI not found.');
    process.exit(1);
  }

  const vars = parseEnvFile(readFileSync(envFile, 'utf8'));
  const entries = Object.entries(vars).filter(([, value]) => value !== '');

  console.log(`Syncing ${entries.length} vars from ${envFile} → ${service}`);
  for (const [key, value] of entries) {
    const quoted = `${key}=${value}`.replace(/"/g, '\\"');
    const cmd = `"${bin}" variable set "${quoted}" --service ${service}`;
    const result = spawnSync(cmd, { stdio: 'pipe', shell: true, encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(`Failed ${key}:`, result.stderr?.trim() || result.stdout?.trim());
      process.exit(result.status ?? 1);
    }
  }
  console.log('Done.');
}

main();
