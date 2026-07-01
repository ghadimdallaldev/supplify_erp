#!/usr/bin/env node
/**
 * Set Railway secrets and references for preprod or production API/web/keycloak.
 *
 * Usage: node scripts/railway-provision-env.mjs preprod
 *        node scripts/railway-provision-env.mjs production
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const TIERS = {
  preprod: {
    railwayEnv: 'preprod',
    apiService: 'supplify-api-preprod',
    webService: 'supplify-web-preprod',
    keycloakService: 'keycloak-preprod',
    postgresRef: 'Postgres',
    redisRef: 'Redis-g5bV',
    storageRef: 'supplify-storage-preprod',
    deployEnv: 'preprod',
  },
  production: {
    railwayEnv: 'production',
    apiService: 'supplify-api-prod',
    webService: 'supplify-web-prod',
    keycloakService: 'keycloak-prod',
    postgresRef: 'Postgres-1Rg2',
    redisRef: 'Redis-_xdW',
    storageRef: 'supplify-storage-prod',
    deployEnv: 'production',
  },
};

const railwayBin = process.platform === 'win32' ? 'railway.cmd' : 'railway';

function secret(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

function run(args, inherit = false) {
  const result = spawnSync(railwayBin, args, {
    encoding: 'utf8',
    shell: true,
    stdio: inherit ? 'inherit' : 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || args.join(' '));
  }
  return result.stdout?.trim() ?? '';
}

function setVar(service, environment, key, value) {
  run([
    'variable',
    'set',
    `${key}=${value}`,
    '--service',
    service,
    '--environment',
    environment,
    '--skip-deploys',
  ]);
}

function main() {
  const tier = process.argv[2];
  const cfg = TIERS[tier];
  if (!cfg) {
    console.error('Usage: node scripts/railway-provision-env.mjs <preprod|production>');
    process.exit(1);
  }

  const sessionSecret = secret();
  const impersonationSecret = secret();
  const keycloakAdminPassword = secret(16);

  console.log(`Provisioning ${tier} (${cfg.railwayEnv})…`);
  run(['environment', 'link', cfg.railwayEnv], true);

  const apiVars = {
    DATABASE_URL: `\${{${cfg.postgresRef}.DATABASE_URL}}`,
    REDIS_URL: `\${{${cfg.redisRef}.REDIS_URL}}`,
    SESSION_SECRET: sessionSecret,
    IMPERSONATION_SECRET: impersonationSecret,
    KEYCLOAK_CLIENT_SECRET: 'changeme',
    KEYCLOAK_ADMIN_PASSWORD: keycloakAdminPassword,
    STORAGE_ENDPOINT: `\${{${cfg.storageRef}.ENDPOINT}}`,
    STORAGE_BUCKET: `\${{${cfg.storageRef}.BUCKET}}`,
    STORAGE_ACCESS_KEY_ID: `\${{${cfg.storageRef}.ACCESS_KEY_ID}}`,
    STORAGE_SECRET_ACCESS_KEY: `\${{${cfg.storageRef}.SECRET_ACCESS_KEY}}`,
    STORAGE_REGION: `\${{${cfg.storageRef}.REGION}}`,
    RAILWAY_DEPLOY_ENV: cfg.deployEnv,
    PAYMENTS_WEBHOOK_SECRET: secret(16),
  };

  for (const [key, value] of Object.entries(apiVars)) {
    setVar(cfg.apiService, cfg.railwayEnv, key, value);
    console.log(`  API ${key}`);
  }

  setVar(cfg.webService, cfg.railwayEnv, 'RAILWAY_DEPLOY_ENV', cfg.deployEnv);
  console.log('  Web RAILWAY_DEPLOY_ENV');

  setVar(cfg.keycloakService, cfg.railwayEnv, 'KEYCLOAK_ADMIN_PASSWORD', keycloakAdminPassword);
  console.log('  Keycloak KEYCLOAK_ADMIN_PASSWORD');

  console.log('\nGenerated (save in password manager):');
  console.log(`  SESSION_SECRET=${sessionSecret}`);
  console.log(`  IMPERSONATION_SECRET=${impersonationSecret}`);
  console.log(`  KEYCLOAK_ADMIN_PASSWORD=${keycloakAdminPassword}`);
}

main();
