import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const environments = {
  development: {
    appUrl: 'https://app-dev.supplifyerp.com',
    authHosts: 'keycloak-dev.supplifyerp.com',
  },
  preprod: {
    appUrl: 'https://app-preprod.supplifyerp.com',
    authHosts: 'keycloak-preprod.supplifyerp.com',
  },
  production: {
    appUrl: 'https://app.supplifyerp.com',
    authHosts: 'keycloak.supplifyerp.com',
  },
}

const environmentName = process.argv[2]
const environment = environments[environmentName]

if (!environment) {
  console.error(
    `Usage: node scripts/sync-capacitor-android.mjs <${Object.keys(environments).join('|')}>`
  )
  process.exit(2)
}

const webRoot = fileURLToPath(new URL('..', import.meta.url))
const capacitorCli = fileURLToPath(
  new URL('../node_modules/@capacitor/cli/bin/capacitor', import.meta.url)
)
const result = spawnSync(process.execPath, [capacitorCli, 'sync', 'android'], {
  cwd: webRoot,
  env: {
    ...process.env,
    CAPACITOR_SERVER_URL: environment.appUrl,
    CAPACITOR_AUTH_HOSTS: environment.authHosts,
  },
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
