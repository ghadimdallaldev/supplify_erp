import dotenv from 'dotenv'
import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Map Railway environment name → deploy/railway/<slug>/ folder.
 */
export function resolveRailwayDeploySlug() {
  const explicit = process.env.RAILWAY_DEPLOY_ENV?.trim().toLowerCase()
  if (explicit) return explicit

  const name = (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || '')
    .trim()
    .toLowerCase()

  if (name === 'dev' || name === 'development') return 'development'
  if (name === 'preprod' || name === 'staging') return 'preprod'
  if (name === 'prod' || name === 'production') return 'production'
  if (name) return name
  return 'development'
}

export function isRailwayRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RAILWAY_SERVICE_NAME ||
      process.env.RAILWAY_PROJECT_ID
  )
}

/**
 * Load deploy/railway/<env>/api.env defaults. Does not override variables already set
 * (Railway dashboard / secrets win).
 */
export function loadRailwayApiEnvDefaults(repoRoot) {
  if (process.env.SKIP_RAILWAY_ENV_FILE === '1') return null
  if (!isRailwayRuntime() && process.env.LOAD_RAILWAY_ENV_FILE !== '1') return null

  const slug = resolveRailwayDeploySlug()
  const file = path.join(repoRoot, 'deploy', 'railway', slug, 'api.env')
  if (!existsSync(file)) return null

  dotenv.config({ path: file })
  return file
}
