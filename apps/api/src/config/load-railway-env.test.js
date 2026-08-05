import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  resolveRailwayDeploySlug,
  isRailwayRuntime,
  loadRailwayApiEnvDefaults,
} from './load-railway-env.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

describe('load-railway-env', () => {
  const envBackup = { ...process.env }

  beforeEach(() => {
    process.env = { ...envBackup }
  })

  afterEach(() => {
    process.env = envBackup
  })

  it('resolveRailwayDeploySlug maps dev names', () => {
    process.env.RAILWAY_ENVIRONMENT = 'development'
    expect(resolveRailwayDeploySlug()).toBe('development')
    process.env.RAILWAY_ENVIRONMENT = 'dev'
    expect(resolveRailwayDeploySlug()).toBe('development')
  })

  it('isRailwayRuntime detects Railway', () => {
    delete process.env.RAILWAY_ENVIRONMENT
    expect(isRailwayRuntime()).toBe(false)
    process.env.RAILWAY_ENVIRONMENT = 'development'
    expect(isRailwayRuntime()).toBe(true)
  })

  it('loadRailwayApiEnvDefaults fills unset vars from development/api.env', () => {
    process.env.RAILWAY_ENVIRONMENT = 'development'
    delete process.env.KEYCLOAK_REALM
    delete process.env.WEB_ORIGIN
    const loaded = loadRailwayApiEnvDefaults(repoRoot)
    expect(loaded).toContain('api.env')
    expect(process.env.KEYCLOAK_REALM).toBe('Supplify')
    expect(process.env.WEB_ORIGIN).toBe('https://app-dev.supplifyerp.com')
  })

  it('does not override existing env vars', () => {
    process.env.RAILWAY_ENVIRONMENT = 'development'
    process.env.KEYCLOAK_REALM = 'custom'
    loadRailwayApiEnvDefaults(repoRoot)
    expect(process.env.KEYCLOAK_REALM).toBe('custom')
  })
})
