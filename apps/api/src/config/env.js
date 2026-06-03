import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { loadRailwayApiEnvDefaults } from './load-railway-env.js'
import { resolveNativeDatabaseUrl } from './resolve-database-url.js'
import {
  envBool,
  envInt,
  resolveAppEnv,
  resolveBillingGatewayId,
  resolvePaymentsMode,
  resolveWebOrigins,
} from './resolve-env.js'
import { resolveRedisUrl } from './resolve-redis-url.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiEnvDir = path.resolve(__dirname, '../..')
const repoRoot = path.resolve(apiEnvDir, '../..')
loadRailwayApiEnvDefaults(repoRoot)
dotenv.config({ path: path.join(apiEnvDir, '.env') })
const dockerSyncPath = path.join(apiEnvDir, '.env.docker-sync')
if (existsSync(dockerSyncPath)) {
  dotenv.config({ path: dockerSyncPath, override: true })
}

const NODE_ENV = process.env.NODE_ENV || 'development'
const APP_ENV = resolveAppEnv(NODE_ENV)
const isProductionNode = NODE_ENV === 'production'
const PAYMENTS_MODE = resolvePaymentsMode(APP_ENV, NODE_ENV)

const envDatabaseUrl = process.env.DATABASE_URL
const resolvedDatabaseUrl = resolveNativeDatabaseUrl(envDatabaseUrl)

const WEB_ORIGINS = resolveWebOrigins({ appEnv: APP_ENV, nodeEnv: NODE_ENV })
const primaryWebOrigin =
  process.env.WEB_ORIGIN ||
  process.env.PUBLIC_FRONTEND_URL ||
  WEB_ORIGINS[0] ||
  (APP_ENV === 'dev' ? 'http://localhost:5173' : '')

export const config = {
  APP_ENV,
  NODE_ENV,
  PORT: process.env.PORT || 4000,
  WEB_ORIGIN: primaryWebOrigin,
  WEB_ORIGINS,
  /** Alias documented for Railway; same as WEB_ORIGINS primary list source */
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  PUBLIC_API_URL:
    process.env.PUBLIC_API_URL ||
    process.env.API_PUBLIC_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 4000}`),
  PUBLIC_FRONTEND_URL:
    process.env.PUBLIC_FRONTEND_URL || primaryWebOrigin || 'http://localhost:5173',
  DATABASE_URL: resolvedDatabaseUrl,
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  /** Railway/managed Postgres often use certs outside the public CA bundle; keep false unless you supply a CA. */
  DATABASE_SSL_REJECT_UNAUTHORIZED: envBool(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, false),
  DATABASE_STATEMENT_TIMEOUT: process.env.DATABASE_STATEMENT_TIMEOUT
    ? parseInt(process.env.DATABASE_STATEMENT_TIMEOUT, 10)
    : undefined,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER || 'keycloak',
  KEYCLOAK_BASE_URL:
    process.env.KEYCLOAK_URL || process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080',
  KEYCLOAK_PUBLIC_URL:
    process.env.KEYCLOAK_PUBLIC_URL ||
    process.env.KEYCLOAK_URL ||
    process.env.KEYCLOAK_BASE_URL ||
    'http://localhost:8080',
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || 'Supplify',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'supplify-api',
  KEYCLOAK_CLIENT_SECRET:
    process.env.KEYCLOAK_CLIENT_SECRET || (isProductionNode ? '' : 'changeme'),
  KEYCLOAK_ADMIN: process.env.KEYCLOAK_ADMIN || 'admin',
  KEYCLOAK_ADMIN_PASSWORD: process.env.KEYCLOAK_ADMIN_PASSWORD || (isProductionNode ? '' : 'admin'),
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '1h',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || '',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
  COOKIE_SECURE: envBool(process.env.COOKIE_SECURE, isProductionNode),
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || (isProductionNode ? 'lax' : 'lax'),
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || '',
  SESSION_SECRET:
    process.env.SESSION_SECRET || (isProductionNode ? '' : 'dev-session-secret-change-me'),
  IMPERSONATION_SECRET:
    process.env.IMPERSONATION_SECRET ||
    process.env.SESSION_SECRET ||
    (isProductionNode ? '' : 'dev-session-secret-change-me'),
  IMPERSONATION_MAX_DURATION_MINUTES: envInt(process.env.IMPERSONATION_MAX_DURATION_MINUTES, 60),
  STORAGE_DRIVER:
    process.env.STORAGE_DRIVER ||
    (process.env.S3_ENDPOINT || process.env.STORAGE_ENDPOINT ? 's3' : 'local'),
  STORAGE_LOCAL_PATH: process.env.STORAGE_LOCAL_PATH || 'uploads',
  STORAGE_PUBLIC_URL:
    process.env.STORAGE_PUBLIC_URL ||
    process.env.S3_PUBLIC_URL ||
    (process.env.STORAGE_DRIVER === 'local' || !process.env.S3_ENDPOINT ? '' : ''),
  STORAGE_ENDPOINT:
    process.env.STORAGE_ENDPOINT ||
    process.env.S3_ENDPOINT ||
    process.env.ENDPOINT ||
    process.env.AWS_ENDPOINT_URL ||
    'http://localhost:9000',
  STORAGE_BUCKET:
    process.env.STORAGE_BUCKET ||
    process.env.S3_BUCKET ||
    process.env.BUCKET ||
    process.env.AWS_S3_BUCKET_NAME ||
    'supplify',
  STORAGE_BUCKETS: process.env.STORAGE_BUCKETS || process.env.S3_BUCKETS || '',
  STORAGE_REGION:
    process.env.STORAGE_REGION ||
    process.env.S3_REGION ||
    process.env.REGION ||
    process.env.AWS_DEFAULT_REGION ||
    'auto',
  STORAGE_ACCESS_KEY_ID:
    process.env.STORAGE_ACCESS_KEY_ID ||
    process.env.STORAGE_ACCESS_KEY ||
    process.env.S3_ACCESS_KEY ||
    process.env.ACCESS_KEY_ID ||
    process.env.AWS_ACCESS_KEY_ID ||
    'minioadmin',
  STORAGE_SECRET_ACCESS_KEY:
    process.env.STORAGE_SECRET_ACCESS_KEY ||
    process.env.S3_SECRET_KEY ||
    process.env.SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    'minioadmin',
  STORAGE_PUBLIC_READ:
    process.env.STORAGE_PUBLIC_READ != null
      ? process.env.STORAGE_PUBLIC_READ !== 'false'
      : process.env.S3_PUBLIC_READ != null
        ? process.env.S3_PUBLIC_READ !== 'false'
        : true,
  STORAGE_S3_FORCE_PATH_STYLE: envBool(
    process.env.STORAGE_S3_FORCE_PATH_STYLE,
    !/storage\.railway\.app|storageapi\.dev/i.test(
      process.env.STORAGE_ENDPOINT ||
        process.env.S3_ENDPOINT ||
        process.env.ENDPOINT ||
        process.env.AWS_ENDPOINT_URL ||
        ''
    )
  ),
  API_PUBLIC_URL:
    process.env.API_PUBLIC_URL ||
    process.env.PUBLIC_API_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${process.env.PORT || 4000}`),
  REDIS_URL: resolveRedisUrl(),
  E2E_SECRET: process.env.E2E_SECRET || '',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '',
  EMAIL_ENABLED: envBool(process.env.EMAIL_ENABLED, true),
  EMAIL_LOG_ONLY: envBool(process.env.EMAIL_LOG_ONLY, false),
  EMAIL_PROVIDER:
    process.env.EMAIL_PROVIDER ||
    (process.env.SENDGRID_API_KEY ? 'sendgrid' : process.env.SMTP_HOST ? 'smtp' : ''),
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Supplify',
  EMAIL_FROM_ADDRESS:
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.EMAIL_FROM ||
    process.env.SENDGRID_FROM_EMAIL ||
    process.env.SMTP_FROM ||
    '',
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || '',
  EMAIL_TEST_TO: process.env.EMAIL_TEST_TO || '',
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || '',
  EMAIL_API_KEY: process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY || '',
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '',
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Supplify',
  SMTP_FROM:
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.SMTP_USER ||
    'noreply@supplify.local',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: envInt(process.env.SMTP_PORT, 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  PAYMENTS_MODE,
  PAYMENTS_PROVIDER: process.env.PAYMENTS_PROVIDER || '',
  PAYMENTS_API_BASE_URL: process.env.PAYMENTS_API_BASE_URL || '',
  PAYMENTS_PUBLIC_KEY: process.env.PAYMENTS_PUBLIC_KEY || '',
  PAYMENTS_SECRET_KEY: process.env.PAYMENTS_SECRET_KEY || '',
  PAYMENTS_WEBHOOK_SECRET: process.env.PAYMENTS_WEBHOOK_SECRET || '',
  BILLING_GATEWAY: resolveBillingGatewayId(PAYMENTS_MODE),
  LOG_LEVEL:
    process.env.LOG_LEVEL || (APP_ENV === 'dev' ? 'debug' : APP_ENV === 'prod' ? 'warn' : 'info'),
  ENABLE_REQUEST_LOGGING: envBool(process.env.ENABLE_REQUEST_LOGGING, APP_ENV !== 'prod'),
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || APP_ENV,
  RATE_LIMIT_ENABLED: envBool(process.env.RATE_LIMIT_ENABLED, APP_ENV !== 'dev'),
  RATE_LIMIT_WINDOW_MS: envInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  RATE_LIMIT_MAX: envInt(process.env.RATE_LIMIT_MAX, isProductionNode ? 300 : 1000),
  TRUST_PROXY: envBool(process.env.TRUST_PROXY, true),
  ENABLE_SWAGGER: envBool(process.env.ENABLE_SWAGGER, APP_ENV === 'dev'),
  ENABLE_DEBUG_ROUTES: envBool(process.env.ENABLE_DEBUG_ROUTES, APP_ENV === 'dev'),
  ENABLE_SEED_ROUTES: envBool(process.env.ENABLE_SEED_ROUTES, APP_ENV === 'dev'),
  RUN_MIGRATIONS_ON_START: envBool(process.env.RUN_MIGRATIONS_ON_START, false),
  ALLOW_DB_RESET: envBool(process.env.ALLOW_DB_RESET, APP_ENV === 'dev'),
  SEED_DEMO_DATA: envBool(process.env.SEED_DEMO_DATA, APP_ENV === 'dev'),
  STAFF_PORTAL_BASE_URL:
    process.env.STAFF_PORTAL_BASE_URL || primaryWebOrigin || 'http://localhost:5173',
  PUBLIC_RESERVATION_BASE_URL:
    process.env.PUBLIC_RESERVATION_BASE_URL || primaryWebOrigin || 'http://localhost:5173',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_EMAIL: process.env.VAPID_EMAIL || 'notifications@supplify.local',
  MEMORY_DEBUG: envBool(process.env.MEMORY_DEBUG, APP_ENV === 'dev'),
  ADMIN_OVERVIEW_DEBUG: envBool(process.env.ADMIN_OVERVIEW_DEBUG, false),
  MEMORY_HEALTH_EXPOSE: envBool(process.env.MEMORY_HEALTH_EXPOSE, APP_ENV === 'dev'),
  MEMORY_WARN_RSS_MB: envInt(process.env.MEMORY_WARN_RSS_MB, 512),
  MEMORY_LOG_INTERVAL_MS: envInt(process.env.MEMORY_LOG_INTERVAL_MS, 5 * 60 * 1000),
  DATABASE_POOL_MAX: envInt(process.env.DATABASE_POOL_MAX, 20),
  CRONS_ENABLED: envBool(process.env.CRONS_ENABLED, true),
  CRON_SCHEDULED_ORDERS_INTERVAL_MS: envInt(
    process.env.CRON_SCHEDULED_ORDERS_INTERVAL_MS,
    isProductionNode ? 60 * 60 * 1000 : 5 * 60 * 1000
  ),
  CRON_OPERATIONAL_REMINDERS_INTERVAL_MS: envInt(
    process.env.CRON_OPERATIONAL_REMINDERS_INTERVAL_MS,
    24 * 60 * 60 * 1000
  ),
  GPS_TRACKING_ENABLED: envBool(process.env.GPS_TRACKING_ENABLED, true),
  GPS_STALE_AFTER_SECONDS: envInt(process.env.GPS_STALE_AFTER_SECONDS, 300),
  GPS_UPDATE_INTERVAL_SECONDS: envInt(process.env.GPS_UPDATE_INTERVAL_SECONDS, 15),
  GPS_MIN_ACCURACY_METERS: envInt(process.env.GPS_MIN_ACCURACY_METERS, 100),
  GPS_LOCATION_RETENTION_DAYS: envInt(process.env.GPS_LOCATION_RETENTION_DAYS, 90),
  GPS_ALLOW_RESTAURANT_LIVE_TRACKING: envBool(process.env.GPS_ALLOW_RESTAURANT_LIVE_TRACKING, true),
  GPS_RESTAURANT_SHOW_DRIVER_NAME: envBool(process.env.GPS_RESTAURANT_SHOW_DRIVER_NAME, true),
  GPS_RESTAURANT_SHOW_DRIVER_PHONE: envBool(process.env.GPS_RESTAURANT_SHOW_DRIVER_PHONE, false),
  GPS_ALLOW_DRIVER_BACKGROUND_HINT: envBool(process.env.GPS_ALLOW_DRIVER_BACKGROUND_HINT, true),
  MAP_PROVIDER: process.env.MAP_PROVIDER || 'google',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || '',
}

if (!config.STORAGE_PUBLIC_URL) {
  if (config.STORAGE_DRIVER === 'local') {
    config.STORAGE_PUBLIC_URL = `${String(config.API_PUBLIC_URL).replace(/\/$/, '')}/uploads`
  } else {
    config.STORAGE_PUBLIC_URL =
      process.env.S3_PUBLIC_URL || process.env.STORAGE_PUBLIC_URL || config.STORAGE_ENDPOINT
  }
}

/** E2E reset-seed and similar tooling — never on preprod/prod */
export function allowDebugRoutes() {
  return config.ENABLE_DEBUG_ROUTES && config.APP_ENV === 'dev' && Boolean(config.E2E_SECRET)
}

export function allowE2eRoutes() {
  return allowDebugRoutes()
}
