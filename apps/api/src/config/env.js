import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { resolveNativeDatabaseUrl } from '../../../../scripts/lib/local-infra-urls.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiEnvDir = path.resolve(__dirname, '../..')
dotenv.config({ path: path.join(apiEnvDir, '.env') })
const dockerSyncPath = path.join(apiEnvDir, '.env.docker-sync')
if (existsSync(dockerSyncPath)) {
  dotenv.config({ path: dockerSyncPath, override: true })
}
const envDatabaseUrl = process.env.DATABASE_URL
const resolvedDatabaseUrl = resolveNativeDatabaseUrl(envDatabaseUrl)

export const config = {
  PORT: process.env.PORT || 4000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:5173',
  /** Allowed CORS origins (comma-separated). Dev: 5173–5175; prod: use WEB_ORIGINS or single WEB_ORIGIN. */
  WEB_ORIGINS: process.env.WEB_ORIGINS
    ? process.env.WEB_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : process.env.NODE_ENV === 'production'
      ? [process.env.WEB_ORIGIN || 'http://localhost:5173']
      : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  DATABASE_URL: resolvedDatabaseUrl,
  /** Enable SSL for DB (e.g. DATABASE_SSL=true in production). */
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  /** Statement timeout in ms (optional; e.g. 30000 for 30s in production). */
  DATABASE_STATEMENT_TIMEOUT: process.env.DATABASE_STATEMENT_TIMEOUT
    ? parseInt(process.env.DATABASE_STATEMENT_TIMEOUT, 10)
    : undefined,
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080',
  /** Browser-facing Keycloak URL (login/logout redirects). Defaults to KEYCLOAK_BASE_URL. */
  KEYCLOAK_PUBLIC_URL:
    process.env.KEYCLOAK_PUBLIC_URL || process.env.KEYCLOAK_BASE_URL || 'http://localhost:8080',
  KEYCLOAK_REALM: process.env.KEYCLOAK_REALM || 'Supplify',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'supplify-api',
  KEYCLOAK_CLIENT_SECRET:
    process.env.KEYCLOAK_CLIENT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'changeme'),
  KEYCLOAK_ADMIN: process.env.KEYCLOAK_ADMIN || 'admin',
  /** Required for invite signup (creates Keycloak users). Defaults to admin in non-production. */
  KEYCLOAK_ADMIN_PASSWORD:
    process.env.KEYCLOAK_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'admin'),
  SESSION_SECRET:
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-session-secret-change-me'),
  /** Secret for signing impersonation tokens (defaults to SESSION_SECRET). */
  IMPERSONATION_SECRET:
    process.env.IMPERSONATION_SECRET ||
    process.env.SESSION_SECRET ||
    (process.env.NODE_ENV === 'production' ? '' : 'dev-session-secret-change-me'),
  /** Max duration for an impersonation session in minutes (default 60). */
  IMPERSONATION_MAX_DURATION_MINUTES: process.env.IMPERSONATION_MAX_DURATION_MINUTES
    ? parseInt(process.env.IMPERSONATION_MAX_DURATION_MINUTES, 10)
    : 60,
  /** MinIO API URL reachable from the API container (Docker: http://minio:9000). */
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  /**
   * Browser-facing base URL for stored objects (product images). Defaults to S3_ENDPOINT.
   * Deploy: http://<your-host>:9000 or https://<domain>/storage if nginx proxies MinIO.
   */
  S3_PUBLIC_URL: process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || 'http://localhost:9000',
  /** Primary bucket for uploads (product images, chat files, logos). */
  S3_BUCKET: process.env.S3_BUCKET || 'supplify',
  /**
   * Comma-separated buckets to create on init (defaults to S3_BUCKET).
   * Example: supplify,supplify-archive — add new names here before switching S3_BUCKET.
   */
  S3_BUCKETS: process.env.S3_BUCKETS || '',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadmin',
  /** When true (default), buckets allow anonymous GetObject for stored URLs. Set false if using signed GET only. */
  S3_PUBLIC_READ: process.env.S3_PUBLIC_READ !== 'false',
  REDIS_URL: process.env.REDIS_URL || '',
  /** Test-only: secret for E2E reset-seed endpoint. When set, POST /api/e2e/reset-seed is enabled. */
  E2E_SECRET: process.env.E2E_SECRET || '',
  /** Twilio Programmable Messaging (WhatsApp). */
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  /** Sender, e.g. whatsapp:+14155238886 or +14155238886 */
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM || '',
  /** Twilio Email (SendGrid API key from Twilio console). */
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY || '',
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || '',
  SENDGRID_FROM_NAME: process.env.SENDGRID_FROM_NAME || 'Supplify',
  SMTP_FROM: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@supplify.local',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  /** Public web URL for staff magic links (defaults to WEB_ORIGIN). */
  STAFF_PORTAL_BASE_URL:
    process.env.STAFF_PORTAL_BASE_URL || process.env.WEB_ORIGIN || 'http://localhost:5173',
  PUBLIC_RESERVATION_BASE_URL:
    process.env.PUBLIC_RESERVATION_BASE_URL || process.env.WEB_ORIGIN || 'http://localhost:5173',
  /** Default payment gateway: stub | manual | stripe | wish_money | bank_transfer */
  BILLING_GATEWAY: process.env.BILLING_GATEWAY || 'stub',
  /** Web Push (VAPID) — generate with: npx web-push generate-vapid-keys */
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_EMAIL: process.env.VAPID_EMAIL || 'notifications@supplify.local',
  /** Log process.memoryUsage() on an interval (also enabled in NODE_ENV=development). */
  MEMORY_DEBUG: process.env.MEMORY_DEBUG === '1' || process.env.MEMORY_DEBUG === 'true',
  /** Include memory + db pool on GET /health (default: on in non-production). */
  MEMORY_HEALTH_EXPOSE:
    process.env.MEMORY_HEALTH_EXPOSE === '1' || process.env.MEMORY_HEALTH_EXPOSE === 'true',
  /** RSS (MB) threshold for warn logs when memory monitoring is active. */
  MEMORY_WARN_RSS_MB: process.env.MEMORY_WARN_RSS_MB
    ? parseInt(process.env.MEMORY_WARN_RSS_MB, 10)
    : 512,
  /** Interval for dev memory debug logs (ms). Default 5 minutes. */
  MEMORY_LOG_INTERVAL_MS: process.env.MEMORY_LOG_INTERVAL_MS
    ? parseInt(process.env.MEMORY_LOG_INTERVAL_MS, 10)
    : 5 * 60 * 1000,
  /** PostgreSQL pool max connections (default 20; use 10 in constrained dev). */
  DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX
    ? parseInt(process.env.DATABASE_POOL_MAX, 10)
    : 20,
}
