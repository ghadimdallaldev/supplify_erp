#!/usr/bin/env node
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { readDockerEnv, getRepoRoot } from './lib/docker-env.mjs'

const root = getRepoRoot()
const docker = readDockerEnv()

const pgPort = docker.POSTGRES_PORT || '5432'
const pgUser = docker.POSTGRES_USER || 'postgres'
const pgPass = docker.POSTGRES_PASSWORD || 'postgres'
const pgDb = docker.POSTGRES_DB || 'supplify'
const kcPort = docker.KEYCLOAK_PORT || '8180'
const redisPort = docker.REDIS_PORT || '6379'
const minioPort = docker.MINIO_API_PORT || '9000'
const sessionSecret = docker.SESSION_SECRET || 'dev-session-secret-change-me'
const kcSecret = docker.KEYCLOAK_CLIENT_SECRET || 'changeme'

const apiEnvPath = path.join(root, 'apps/api/.env')
const apiExample = path.join(root, 'apps/api/env.example')

if (!existsSync(apiEnvPath) && existsSync(apiExample)) {
  copyFileSync(apiExample, apiEnvPath)
  console.log('Created apps/api/.env from env.example')
}

const apiLines = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, 'utf8').split('\n') : []
const apiVars = Object.fromEntries(
  apiLines
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const merged = {
  PORT: '4000',
  NODE_ENV: 'development',
  WEB_ORIGIN: 'http://localhost:5173',
  WEB_ORIGINS: 'http://localhost:5173,http://localhost:4000',
  DATABASE_URL: `postgresql://${pgUser}:${pgPass}@localhost:${pgPort}/${pgDb}`,
  KEYCLOAK_BASE_URL: `http://localhost:${kcPort}`,
  KEYCLOAK_PUBLIC_URL: `http://localhost:${kcPort}`,
  KEYCLOAK_REALM: 'Supplify',
  KEYCLOAK_CLIENT_ID: 'supplify-api',
  KEYCLOAK_CLIENT_SECRET: kcSecret,
  SESSION_SECRET: sessionSecret,
  REDIS_URL: `redis://localhost:${redisPort}`,
  S3_ENDPOINT: `http://localhost:${minioPort}`,
  S3_BUCKET: docker.S3_BUCKET || 'supplify',
  S3_ACCESS_KEY: docker.MINIO_ROOT_USER || 'minioadmin',
  S3_SECRET_KEY: docker.MINIO_ROOT_PASSWORD || 'minioadmin',
  ...apiVars,
  // Always sync connection endpoints from docker/.env for native dev
  DATABASE_URL: `postgresql://${pgUser}:${pgPass}@localhost:${pgPort}/${pgDb}`,
  KEYCLOAK_BASE_URL: `http://localhost:${kcPort}`,
  KEYCLOAK_PUBLIC_URL: `http://localhost:${kcPort}`,
  WEB_ORIGIN: 'http://localhost:5173',
  REDIS_URL: `redis://localhost:${redisPort}`,
  S3_ENDPOINT: `http://localhost:${minioPort}`,
}

writeFileSync(
  apiEnvPath,
  Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n') + '\n'
)

const webEnvPath = path.join(root, 'apps/web/.env.development.local')
const webEnv = [
  '# Auto-generated for native pnpm dev (Vite proxies /api and /auth)',
  `VITE_KEYCLOAK_URL=http://localhost:${kcPort}`,
  'VITE_KEYCLOAK_REALM=Supplify',
  '# Leave VITE_API_URL unset — dev mode uses same-origin + Vite proxy',
  '',
].join('\n')
writeFileSync(webEnvPath, webEnv)

console.log(`Native env ready (API → localhost:${pgPort} postgres, web → :5173)`)
