/** Map EXPO_PUBLIC_API_URL host to the matching Supplify web app origin. */

const WEB_ORIGIN_BY_API_HOST: Record<string, string> = {
  'api-dev.supplifyerp.com': 'https://app-dev.supplifyerp.com',
  'api-preprod.supplifyerp.com': 'https://app-preprod.supplifyerp.com',
  'api.supplifyerp.com': 'https://app.supplifyerp.com',
}

const DEFAULT_WEB_ORIGIN = 'https://app.supplifyerp.com'

function resolveWebOrigin(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/$/, '')
  if (!trimmed) return DEFAULT_WEB_ORIGIN

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    const mapped = WEB_ORIGIN_BY_API_HOST[parsed.hostname]
    if (mapped) return mapped

    if (parsed.hostname.startsWith('api-')) {
      return `https://app-${parsed.hostname.slice(4)}`
    }

    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '10.0.2.2'
    ) {
      return 'http://localhost:5173'
    }
  } catch {
    /* ignore invalid URLs */
  }

  return DEFAULT_WEB_ORIGIN
}

export function webAppUrl(path: string): string {
  const api = process.env.EXPO_PUBLIC_API_URL ?? ''
  const origin = resolveWebOrigin(api)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${origin.replace(/\/$/, '')}${normalizedPath}`
}
