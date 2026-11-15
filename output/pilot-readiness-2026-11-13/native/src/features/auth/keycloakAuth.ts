import * as AuthSession from 'expo-auth-session'
import * as WebBrowser from 'expo-web-browser'
import { Platform } from 'react-native'
import {
  apiUrl,
  authRedirectUri,
  authRedirectUriOverride,
  getKeycloakIssuer,
  keycloakClientId,
} from '../../config/env'
import { saveTokens } from './tokenStorage'
import { assertRequestScope, getRequestScopeVersion } from './requestScope'

WebBrowser.maybeCompleteAuthSession()

export type TokenResponse = {
  accessToken: string
  refreshToken: string
  expiresIn?: number
  idToken?: string
}

const ANDROID_EMULATOR_REDIRECT = 'exp://10.0.2.2:8081/--/auth/callback'

/**
 * Must match Keycloak client `supplify-mobile` Valid Redirect URIs exactly.
 * Standalone builds always use the fixed deep link — makeRedirectUri can emit
 * triple-slash or package-id variants that Keycloak rejects with "We are sorry".
 */
export function getOAuthRedirectUri(): string {
  if (authRedirectUriOverride) return authRedirectUriOverride
  if (__DEV__ && Platform.OS === 'android') return ANDROID_EMULATOR_REDIRECT
  if (__DEV__ && Platform.OS !== 'web') return 'exp://127.0.0.1:8081/--/auth/callback'
  return authRedirectUri
}

const PKCE_VERIFIER_KEY = 'supplify_pkce_verifier'
const PKCE_REDIRECT_KEY = 'supplify_pkce_redirect'
const HANDLED_CODE_KEY = 'supplify_oauth_handled_code'

function persistPkceForWeb(codeVerifier: string | undefined, redirectUri: string) {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined' || !codeVerifier) return
  localStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier)
  localStorage.setItem(PKCE_REDIRECT_KEY, redirectUri)
}

function clearPkceForWeb() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return
  localStorage.removeItem(PKCE_VERIFIER_KEY)
  localStorage.removeItem(PKCE_REDIRECT_KEY)
  localStorage.removeItem(HANDLED_CODE_KEY)
}

function readPkceForWeb() {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') {
    return { verifier: null as string | null, redirectUri: null as string | null }
  }
  return {
    verifier: localStorage.getItem(PKCE_VERIFIER_KEY),
    redirectUri: localStorage.getItem(PKCE_REDIRECT_KEY),
  }
}

export async function completeWebOAuthCallbackIfNeeded(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false
  const url = new URL(window.location.href)
  if (!url.pathname.includes('auth/callback')) return false
  const code = url.searchParams.get('code')
  if (!code) return false
  if (localStorage.getItem(HANDLED_CODE_KEY) === code) {
    window.history.replaceState({}, '', '/')
    return false
  }

  const { verifier, redirectUri: storedRedirect } = readPkceForWeb()
  const redirectUri = storedRedirect ?? getOAuthRedirectUri()
  if (!verifier) return false
  localStorage.setItem(HANDLED_CODE_KEY, code)

  const discovery = await AuthSession.fetchDiscoveryAsync(getKeycloakIssuer())
  const tokenResult = await AuthSession.exchangeCodeAsync(
    {
      clientId: keycloakClientId,
      code,
      redirectUri,
      extraParams: { code_verifier: verifier },
    },
    discovery
  )

  if (!tokenResult.accessToken || !tokenResult.refreshToken) {
    throw new Error('Keycloak did not return tokens')
  }
  await saveTokens(tokenResult.accessToken, tokenResult.refreshToken, tokenResult.idToken)
  clearPkceForWeb()
  window.history.replaceState({}, '', '/')
  return true
}

export async function loginWithKeycloak(mode: 'login' | 'register' = 'login'): Promise<TokenResponse> {
  const discovery = await AuthSession.fetchDiscoveryAsync(getKeycloakIssuer())
  const redirectUri = getOAuthRedirectUri()

  if (__DEV__) {
    console.info('[auth] Keycloak issuer:', getKeycloakIssuer())
    console.info('[auth] OAuth redirect URI:', redirectUri)
  }

  const request = new AuthSession.AuthRequest({
    clientId: keycloakClientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    prompt: AuthSession.Prompt.Login,
    extraParams: mode === 'register' ? { kc_action: 'register' } : undefined,
  })

  await request.makeAuthUrlAsync(discovery)
  persistPkceForWeb(request.codeVerifier, redirectUri)
  const result = await request.promptAsync(discovery, {
    preferEphemeralSession: Platform.OS === 'ios',
  })

  if (__DEV__) console.info('[auth] OAuth prompt result:', result.type)

  if (result.type !== 'success' || !result.params.code) {
    if (result.type === 'cancel') throw new Error('Login cancelled')
    if (result.type === 'dismiss') {
      throw new Error('Sign-in was not completed. Finish login in the browser or try again.')
    }
    throw new Error(`Login failed (${result.type})`)
  }

  let tokenResult: AuthSession.TokenResponse
  try {
    tokenResult = await AuthSession.exchangeCodeAsync(
      {
        clientId: keycloakClientId,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      discovery
    )
  } catch (error) {
    if (__DEV__) console.warn('[auth] Token exchange failed:', error)
    throw new Error('Could not exchange authorization code with Keycloak')
  }

  if (!tokenResult.accessToken || !tokenResult.refreshToken) {
    throw new Error('Keycloak did not return tokens')
  }

  await saveTokens(tokenResult.accessToken, tokenResult.refreshToken, tokenResult.idToken)
  clearPkceForWeb()
  return {
    accessToken: tokenResult.accessToken,
    refreshToken: tokenResult.refreshToken,
    expiresIn: tokenResult.expiresIn,
    idToken: tokenResult.idToken,
  }
}

export async function endKeycloakSession(idToken?: string | null): Promise<void> {
  try {
    const discovery = await AuthSession.fetchDiscoveryAsync(getKeycloakIssuer())
    const endSessionUrl = discovery.endSessionEndpoint
    if (!endSessionUrl) return
    const redirectUri = getOAuthRedirectUri()
    const params = new URLSearchParams({ post_logout_redirect_uri: redirectUri })
    if (idToken) params.set('id_token_hint', idToken)
    await WebBrowser.openAuthSessionAsync(`${endSessionUrl}?${params}`, redirectUri)
  } catch {
    // Best effort: local logout has already completed.
  }
}

export async function refreshMobileTokens(refreshToken: string): Promise<TokenResponse> {
  const scope = getRequestScopeVersion()
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/mobile/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const json = await response.json()
  assertRequestScope(scope)
  if (!response.ok || !json.ok) {
    throw new Error(json.error?.message ?? 'Token refresh failed')
  }
  const { access_token, refresh_token } = json.data
  await saveTokens(access_token, refresh_token, undefined, scope)
  return { accessToken: access_token, refreshToken: refresh_token }
}
