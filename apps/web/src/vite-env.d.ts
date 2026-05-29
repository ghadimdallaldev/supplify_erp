/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  readonly VITE_API_URL?: string
  readonly VITE_PUBLIC_FRONTEND_URL?: string
  readonly VITE_AUTH_PROVIDER?: string
  readonly VITE_KEYCLOAK_URL?: string
  readonly VITE_KEYCLOAK_REALM?: string
  readonly VITE_KEYCLOAK_CLIENT_ID?: string
  readonly VITE_PAYMENTS_MODE?: string
  readonly VITE_PAYMENTS_PUBLIC_KEY?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_SENTRY_ENVIRONMENT?: string
  readonly VITE_ENABLE_DEBUG_UI?: string
  readonly VITE_ENABLE_DEMO_BANNERS?: string
  readonly VITE_ENABLE_MOCK_PAYMENTS?: string
  readonly VITE_ENABLE_TEST_DATA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'papaparse' {
  interface ParseResult<T> {
    data: T[]
  }
  interface ParseConfig<T> {
    header?: boolean
    skipEmptyLines?: boolean
    complete?: (results: ParseResult<T>) => void
    error?: (error: Error) => void
  }
  function parse<T = unknown>(input: string | File, config?: ParseConfig<T>): ParseResult<T>
  export { parse }
}
