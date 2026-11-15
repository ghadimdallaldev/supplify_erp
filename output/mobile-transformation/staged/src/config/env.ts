/** Keep aligned with apps/web/src/lib/env.ts where applicable. */

import { Platform } from 'react-native'

/** Android emulator loopback alias for the host machine. */
export const androidEmulatorHost = '10.0.2.2'

/** Rewrite localhost URLs so Android emulator reaches the dev machine. */
export function resolveDevHostForAndroid(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      parsed.hostname = androidEmulatorHost
      return parsed.toString().replace(/\/$/, '')
    }
  } catch {
    /* ignore invalid URLs */
  }
  return url
}

function resolveDevHost(url: string): string {
  if (!__DEV__ || Platform.OS !== 'android') return url
  return resolveDevHostForAndroid(url)
}

export const apiUrl = resolveDevHost(process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost')

export const keycloakUrl = resolveDevHost(
  process.env.EXPO_PUBLIC_KEYCLOAK_URL ?? 'http://localhost:8180'
)

export const keycloakRealm = process.env.EXPO_PUBLIC_KEYCLOAK_REALM ?? 'Supplify'

export const keycloakClientId = process.env.EXPO_PUBLIC_KEYCLOAK_CLIENT_ID ?? 'supplify-mobile'

export const gpsTrackingEnabled = process.env.EXPO_PUBLIC_GPS_TRACKING_ENABLED !== 'false'

export const gpsUpdateIntervalSeconds = Math.max(
  5,
  Number(process.env.EXPO_PUBLIC_GPS_UPDATE_INTERVAL_SECONDS ?? 15)
)

export const mapProvider = process.env.EXPO_PUBLIC_MAP_PROVIDER ?? 'osm'

/** Production / dev build deep link (EAS). Expo Go uses exp:// — see getOAuthRedirectUri(). */
export const authRedirectUri = 'supplify://auth/callback'

/** Override OAuth redirect (e.g. physical device on LAN). */
export const authRedirectUriOverride = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URI

export function getKeycloakIssuer() {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${keycloakRealm}`
}
