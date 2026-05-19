import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

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
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
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
  KEYCLOAK_ADMIN_PASSWORD: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
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
  S3_ENDPOINT: process.env.S3_ENDPOINT || 'http://localhost:9000',
  S3_BUCKET: process.env.S3_BUCKET || 'supplify',
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY || 'minioadmin',
  S3_SECRET_KEY: process.env.S3_SECRET_KEY || 'minioadmin',
  REDIS_URL: process.env.REDIS_URL || '',
  /** Test-only: secret for E2E reset-seed endpoint. When set, POST /api/e2e/reset-seed is enabled. */
  E2E_SECRET: process.env.E2E_SECRET || '',
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
}
