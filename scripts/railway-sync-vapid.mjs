#!/usr/bin/env node
/**
 * Push VAPID_* from deploy/env/.env.vapid to the Railway API service.
 *
 * Prerequisites:
 *   npm i -g @railway/cli && railway login && railway link
 *   pnpm vapid:generate
 *
 * Usage:
 *   pnpm railway:vapid:sync -- development
 *   pnpm railway:vapid:sync -- preprod --service supplify-api-preprod
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const railwayBin = process.platform === 'win32' ? 'railway.cmd' : 'railway'

const ENVS = new Set(['development', 'preprod', 'staging', 'production'])

function usage() {
  console.error('Usage: pnpm railway:vapid:sync -- <env> [--service <railway-api-service-name>]')
  console.error(`  env: ${[...ENVS].join(' | ')}`)
  process.exit(1)
}

function parseArgs(argv) {
  const positional = []
  let service = process.env.RAILWAY_API_SERVICE || null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--service') {
      service = argv[i + 1]
      i += 1
    } else {
      positional.push(argv[i])
    }
  }
  const env = positional[0]
  if (!env || !ENVS.has(env)) usage()
  return { env, service }
}

function parseEnvFile(content) {
  const vars = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

function runRailway(args, inherit = false) {
  return spawnSync(railwayBin, args, {
    stdio: inherit ? 'inherit' : 'pipe',
    shell: true,
    encoding: 'utf8',
  })
}

function main() {
  const { env, service } = parseArgs(process.argv.slice(2))
  const vapidFile = resolve(root, 'deploy/env/.env.vapid')
  if (!existsSync(vapidFile)) {
    console.error(`Missing ${vapidFile}. Run: pnpm vapid:generate`)
    process.exit(1)
  }

  const version = runRailway(['--version'])
  if (version.status !== 0) {
    console.error('Railway CLI not found. Install: npm i -g @railway/cli')
    process.exit(1)
  }

  const all = parseEnvFile(readFileSync(vapidFile, 'utf8'))
  const keys = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_EMAIL']
  const missing = keys.filter((k) => !all[k] || all[k].startsWith('CHANGE_'))
  if (missing.length) {
    console.error(`Invalid or missing in ${vapidFile}: ${missing.join(', ')}`)
    console.error('Run: pnpm vapid:generate')
    process.exit(1)
  }

  console.log(`Syncing VAPID keys to Railway (${env})`)
  if (service) console.log(`Service: ${service}`)

  for (const key of keys) {
    const result = runRailway(['variable', 'set', `${key}=${all[key]}`, ...(service ? ['--service', service] : [])], true)
    if (result.status !== 0) {
      console.error(`\nFailed setting ${key}. Run \`railway link\` and select the correct project/environment.`)
      process.exit(result.status ?? 1)
    }
  }

  console.log('\nDone. Redeploy the API service (or wait for auto-deploy), then reload Settings.')
}

main()
