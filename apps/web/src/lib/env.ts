/** Central Vite env access — values come from build-time .env / Railway variables */

export const appEnv = import.meta.env.VITE_APP_ENV ?? (import.meta.env.DEV ? 'dev' : 'prod')

export const publicFrontendUrl = import.meta.env.VITE_PUBLIC_FRONTEND_URL ?? 'http://localhost:5173'

export const authProvider = import.meta.env.VITE_AUTH_PROVIDER ?? 'keycloak'

export const keycloakUrl = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080'

export const keycloakRealm = import.meta.env.VITE_KEYCLOAK_REALM ?? 'Supplify'

export const keycloakClientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'supplify-web'

export const paymentsMode = import.meta.env.VITE_PAYMENTS_MODE ?? 'mock'

export const paymentsPublicKey = import.meta.env.VITE_PAYMENTS_PUBLIC_KEY ?? ''

export const sentryDsn = import.meta.env.VITE_SENTRY_DSN ?? ''

export const sentryEnvironment = import.meta.env.VITE_SENTRY_ENVIRONMENT ?? appEnv

export const enableDebugUi = import.meta.env.VITE_ENABLE_DEBUG_UI === 'true'

export const enableDemoBanners = import.meta.env.VITE_ENABLE_DEMO_BANNERS === 'true'

export const enableMockPayments = import.meta.env.VITE_ENABLE_MOCK_PAYMENTS === 'true'

export const enableTestData = import.meta.env.VITE_ENABLE_TEST_DATA === 'true'

/** Business model experiment: v1 (default) | v2 (supplier-first) */
export const supplifyModelVersion =
  (import.meta.env.VITE_SUPPLIFY_MODEL_VERSION ?? 'v1').trim().toLowerCase() === 'v2' ? 'v2' : 'v1'

/** Dev-only fallback when Vite proxy is used (no VITE_API_URL). */
export const DEV_API_ORIGIN = 'http://localhost:4000'

const HOSTED_ENVS = new Set(['preprod', 'prod'])

/**
 * API origin for fetch/RTK. Empty string uses Vite dev proxy (relative paths).
 * Preprod/prod builds must set VITE_API_URL — never silently use localhost.
 */
export function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? ''
  if (configured) return configured
  if (import.meta.env.DEV) return ''
  if (HOSTED_ENVS.has(appEnv)) {
    throw new Error(
      `Configuration error: VITE_API_URL is required when VITE_APP_ENV=${appEnv}. ` +
        'Set it in Railway (or your build env) before deploying the web service.'
    )
  }
  return ''
}

let cachedApiBase: string | null = null

/** Cached API origin (resolves once per page load). */
export function getApiBase(): string {
  if (cachedApiBase === null) {
    cachedApiBase = resolveApiBase()
  }
  return cachedApiBase
}

export function isProdEnv() {
  return appEnv === 'prod'
}

export function isPreprodEnv() {
  return appEnv === 'preprod'
}

export function isDevEnv() {
  return appEnv === 'dev' || import.meta.env.DEV
}

/**
 * Fail fast in hosted builds when required Vite variables are missing.
 * Call from main.tsx before rendering the app.
 */
export function assertHostedWebConfig(): void {
  if (!HOSTED_ENVS.has(appEnv)) return
  resolveApiBase()
  if (!import.meta.env.VITE_KEYCLOAK_URL?.trim()) {
    throw new Error(
      `Configuration error: VITE_KEYCLOAK_URL is required when VITE_APP_ENV=${appEnv}.`
    )
  }
}
