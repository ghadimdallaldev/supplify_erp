import { jwtVerify, createRemoteJWKSet } from 'jose'
import { config } from '../config/env.js'
import { logger } from './logger.js'
import axios from 'axios'

/** Timeout for outbound HTTP calls to Keycloak (ms). Prevents hung requests. */
const KEYCLOAK_HTTP_TIMEOUT_MS = 10000

let keycloakConfig = null

// Get Keycloak configuration values
function getKeycloakValues() {
  return {
    KEYCLOAK_BASE_URL: config.KEYCLOAK_BASE_URL,
    KEYCLOAK_PUBLIC_URL: config.KEYCLOAK_PUBLIC_URL,
    KEYCLOAK_REALM: config.KEYCLOAK_REALM,
    KEYCLOAK_CLIENT_ID: config.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET: config.KEYCLOAK_CLIENT_SECRET,
  }
}

// Fetch Keycloak configuration
export async function getKeycloakConfig() {
  if (keycloakConfig) {
    return keycloakConfig
  }

  const { KEYCLOAK_BASE_URL, KEYCLOAK_REALM } = getKeycloakValues()
  const WELL_KNOWN_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`

  logger.debug('Fetching Keycloak config', { url: WELL_KNOWN_URL })

  try {
    const response = await axios.get(WELL_KNOWN_URL, { timeout: KEYCLOAK_HTTP_TIMEOUT_MS })
    keycloakConfig = response.data
    logger.debug('Keycloak configuration loaded')
    return keycloakConfig
  } catch (error) {
    logger.warn('Keycloak well-known failed, using manual config', { error: error.message })

    // Fallback: construct configuration manually
    keycloakConfig = {
      authorization_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
      token_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      userinfo_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      jwks_uri: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
      revocation_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
      end_session_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
      issuer: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}`,
    }

    logger.debug('Keycloak fallback config used')
    return keycloakConfig
  }
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code, redirectUri) {
  try {
    const config = await getKeycloakConfig()
    const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } = getKeycloakValues()

    logger.debug('Exchanging code for tokens')

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    })

    const response = await axios.post(config.token_endpoint, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
    })

    const tokens = response.data
    logger.debug('Token exchange successful')
    return tokens
  } catch (error) {
    if (error.response) {
      logger.error('Token exchange failed', {
        status: error.response.status,
        statusText: error.response.statusText,
      })
      throw new Error(
        `Token exchange failed: ${error.response.status} ${error.response.statusText}`
      )
    } else {
      logger.error('Error exchanging code for tokens:', error.message)
      throw error
    }
  }
}

/** Resource-owner password grant (invite acceptance, tests). */
export async function exchangePasswordForTokens(username, password) {
  const config = await getKeycloakConfig()
  const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } = getKeycloakValues()

  const params = new URLSearchParams({
    grant_type: 'password',
    client_id: KEYCLOAK_CLIENT_ID,
    client_secret: KEYCLOAK_CLIENT_SECRET,
    username,
    password,
    scope: 'openid profile email',
  })

  const response = await axios.post(config.token_endpoint, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
  })
  return response.data
}

// Refresh access token
export async function refreshAccessToken(refreshToken) {
  try {
    const config = await getKeycloakConfig()
    const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } = getKeycloakValues()

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      refresh_token: refreshToken,
    })

    const response = await axios.post(config.token_endpoint, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
    })

    const tokens = response.data
    logger.debug('Token refreshed')
    return tokens
  } catch (error) {
    logger.error('Error refreshing token:', error.message)
    return null
  }
}

// Normalize issuer for comparison (Keycloak may use with or without trailing slash)
function normalizeIssuer(iss) {
  if (!iss || typeof iss !== 'string') return ''
  return iss.replace(/\/$/, '')
}

// Verify JWT token
export async function verifyToken(token) {
  try {
    const config = await getKeycloakConfig()
    const { KEYCLOAK_CLIENT_ID } = getKeycloakValues()

    // Decode the token manually to extract payload (for issuer/audience handling)
    const parts = token.split('.')
    const headerPart = parts[0]
    const payloadPart = parts[1]

    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString())
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString())

    const expectedIssuer = normalizeIssuer(config.issuer)
    const tokenIssuer = normalizeIssuer(payload.iss)
    if (tokenIssuer && expectedIssuer && tokenIssuer !== expectedIssuer) {
      logger.warn('Issuer mismatch', { expected: expectedIssuer, token: tokenIssuer })
    }

    // Use issuer from token so we match Keycloak's exact format (with or without trailing slash)
    const verifyIssuer = payload.iss || config.issuer
    const JWKS = createRemoteJWKSet(new URL(config.jwks_uri))

    // Accept API or Web client (Keycloak may set aud/azp for either depending on flow)
    const acceptableAudiences = [KEYCLOAK_CLIENT_ID, 'supplify-web']
    const tokenAud = payload.aud
    const tokenAzp = payload.azp
    const audList = Array.isArray(tokenAud) ? tokenAud : tokenAud ? [tokenAud] : []
    const hasValidAud =
      audList.some((a) => acceptableAudiences.includes(a)) || acceptableAudiences.includes(tokenAzp)

    try {
      await jwtVerify(token, JWKS, {
        issuer: verifyIssuer,
        audience: KEYCLOAK_CLIENT_ID,
      })
      return payload
    } catch (firstError) {
      const msg = firstError?.message || ''
      // Missing aud or wrong aud: verify signature + issuer only, then check audience manually
      if (
        msg.includes('missing required "aud" claim') ||
        msg.includes('audience') ||
        msg.includes('aud')
      ) {
        await jwtVerify(token, JWKS, { issuer: verifyIssuer })
        if (!hasValidAud && (tokenAzp || audList.length > 0)) {
          throw new Error(
            `Token audience mismatch. Expected one of: ${acceptableAudiences.join(', ')}, Got azp: ${tokenAzp}, aud: ${JSON.stringify(tokenAud)}`
          )
        }
        return payload
      }
      throw firstError
    }
  } catch (error) {
    const errorMessage = error?.message || 'Unknown error'
    const errorName = error?.name || 'Unknown'
    const errorCode = error?.code || 'Unknown'

    // If token is expired, throw a specific error that can be caught for refresh
    if (
      errorCode === 'ERR_JWT_EXPIRED' ||
      errorName === 'JWTExpired' ||
      errorMessage.includes('expired')
    ) {
      logger.debug('Token expired, refresh will be attempted')
      const expiredError = new Error('Token expired')
      expiredError.name = 'JWTExpired'
      expiredError.code = 'ERR_JWT_EXPIRED'
      throw expiredError
    }

    logger.error('Token verification failed', {
      message: errorMessage,
      name: errorName,
      code: errorCode,
    })
    throw new Error('Invalid token')
  }
}

function claimsFromJwt(jwt) {
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch {
    return null
  }
}

function userInfoFromClaims(payload) {
  if (!payload?.sub) return null
  const email = payload.email || payload.preferred_username
  if (!email) return null
  return {
    sub: payload.sub,
    email,
    given_name: payload.given_name,
    family_name: payload.family_name,
    preferred_username: payload.preferred_username,
  }
}

// Get user info from Keycloak (falls back to ID/access token claims if userinfo is unavailable)
export async function getUserInfo(accessToken, idToken = null) {
  try {
    const config = await getKeycloakConfig()
    const USERINFO_URL =
      config.userinfo_endpoint ||
      `${getKeycloakValues().KEYCLOAK_BASE_URL}/realms/${getKeycloakValues().KEYCLOAK_REALM}/protocol/openid-connect/userinfo`

    const response = await axios.get(USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
    })

    return response.data
  } catch (error) {
    const status = error.response?.status
    const body = error.response?.data
    logger.warn('Keycloak userinfo failed, using token claims', {
      message: error.message,
      status,
      body,
    })

    if (idToken) {
      const fromId = userInfoFromClaims(claimsFromJwt(idToken))
      if (fromId) return fromId
    }

    const fromAccess = userInfoFromClaims(claimsFromJwt(accessToken))
    if (fromAccess) return fromAccess

    throw new Error(
      `Userinfo unavailable and token missing sub/email (status: ${status ?? 'unknown'})`
    )
  }
}

// Revoke token
export async function revokeToken(token) {
  try {
    const config = await getKeycloakConfig()
    const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } = getKeycloakValues()

    const params = new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      token,
    })

    const response = await axios.post(config.revocation_endpoint, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
    })

    return response.status === 200
  } catch (error) {
    logger.error('Error revoking token', { error: error.message })
    return false
  }
}

// Generate authorization URL
export async function getAuthorizationUrl(redirectUri, state) {
  const { KEYCLOAK_PUBLIC_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } = getKeycloakValues()

  const authorizationEndpoint = `${KEYCLOAK_PUBLIC_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
  })

  return `${authorizationEndpoint}?${params.toString()}`
}

/** Keycloak hosted registration (same OAuth redirect as login, via /registrations). */
export async function getRegistrationUrl(redirectUri, state) {
  const { KEYCLOAK_PUBLIC_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } = getKeycloakValues()

  const registrationEndpoint = `${KEYCLOAK_PUBLIC_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/registrations`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
  })

  return `${registrationEndpoint}?${params.toString()}`
}

/**
 * Build Keycloak end_session (logout) URL so the user's browser is redirected there
 * to clear Keycloak's SSO session. After logout, Keycloak redirects to postLogoutRedirectUri.
 */
export async function getKeycloakLogoutUrl(postLogoutRedirectUri) {
  const { KEYCLOAK_PUBLIC_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } = getKeycloakValues()
  const endSession = `${KEYCLOAK_PUBLIC_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`
  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirectUri,
    client_id: KEYCLOAK_CLIENT_ID,
  })
  return `${endSession}?${params.toString()}`
}
