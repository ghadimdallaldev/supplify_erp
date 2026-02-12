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
    KEYCLOAK_REALM: config.KEYCLOAK_REALM,
    KEYCLOAK_CLIENT_ID: config.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET: config.KEYCLOAK_CLIENT_SECRET,
  }
}

// Fetch Keycloak configuration
export async function getKeycloakConfig() {
  if (keycloakConfig) {
    logger.info('Using cached Keycloak config')
    return keycloakConfig
  }

  const { KEYCLOAK_BASE_URL, KEYCLOAK_REALM } = getKeycloakValues()
  const WELL_KNOWN_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid_configuration`

  logger.info('Attempting to fetch Keycloak config from:', WELL_KNOWN_URL)

  try {
    const response = await axios.get(WELL_KNOWN_URL, { timeout: KEYCLOAK_HTTP_TIMEOUT_MS })
    keycloakConfig = response.data
    logger.info('Keycloak configuration loaded from well-known endpoint')
    return keycloakConfig
  } catch (error) {
    logger.warn(
      'Failed to load Keycloak configuration from well-known endpoint, using manual configuration'
    )
    logger.warn('Error details:', error.message)

    // Fallback: construct configuration manually
    keycloakConfig = {
      authorization_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
      token_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
      userinfo_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
      jwks_uri: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
      revocation_endpoint: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/logout`,
      issuer: `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}`,
    }

    logger.info('Fallback config created:', keycloakConfig)

    logger.info('Keycloak configuration constructed manually')
    return keycloakConfig
  }
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code, redirectUri) {
  try {
    const config = await getKeycloakConfig()
    const { KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET } = getKeycloakValues()

    logger.info('Exchanging code for tokens', {
      code: code.substring(0, 10) + '...',
      redirectUri,
      clientId: KEYCLOAK_CLIENT_ID,
      tokenEndpoint: config.token_endpoint,
    })

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

    logger.info('Token exchange response status:', response.status)

    const tokens = response.data
    logger.info('Tokens exchanged successfully')
    return tokens
  } catch (error) {
    if (error.response) {
      logger.error('Token exchange failed:', {
        status: error.response.status,
        statusText: error.response.statusText,
        error: error.response.data,
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
    logger.info('Token refreshed successfully')
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

    logger.info('Verifying token with:', {
      issuer: config.issuer,
      audience: KEYCLOAK_CLIENT_ID,
      tokenPrefix: token.substring(0, 20) + '...',
    })

    // Decode the token manually to extract payload (for issuer/audience handling)
    const parts = token.split('.')
    const headerPart = parts[0]
    const payloadPart = parts[1]

    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString())
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString())

    logger.info('Token decoded successfully:', {
      alg: header.alg,
      kid: header.kid,
      iss: payload.iss,
      azp: payload.azp,
      aud: payload.aud,
      sub: payload.sub,
    })

    const expectedIssuer = normalizeIssuer(config.issuer)
    const tokenIssuer = normalizeIssuer(payload.iss)
    if (tokenIssuer && expectedIssuer && tokenIssuer !== expectedIssuer) {
      logger.warn('Issuer mismatch (normalized):', { expected: expectedIssuer, token: tokenIssuer })
    }

    // Use issuer from token so we match Keycloak's exact format (with or without trailing slash)
    const verifyIssuer = payload.iss || config.issuer
    const JWKS = createRemoteJWKSet(new URL(config.jwks_uri))

    // Accept API or Web client (Keycloak may set aud/azp for either depending on flow)
    const acceptableAudiences = [KEYCLOAK_CLIENT_ID, 'supplify-web']
    const tokenAud = payload.aud
    const tokenAzp = payload.azp
    const audList = Array.isArray(tokenAud) ? tokenAud : tokenAud ? [tokenAud] : []
    const hasValidAud = audList.some((a) => acceptableAudiences.includes(a)) || acceptableAudiences.includes(tokenAzp)

    try {
      await jwtVerify(token, JWKS, {
        issuer: verifyIssuer,
        audience: KEYCLOAK_CLIENT_ID,
      })
      logger.info('Token verification successful')
      return payload
    } catch (firstError) {
      const msg = firstError?.message || ''
      // Missing aud or wrong aud: verify signature + issuer only, then check audience manually
      if (
        msg.includes('missing required "aud" claim') ||
        msg.includes('audience') ||
        msg.includes('aud')
      ) {
        logger.info('Verifying without strict audience (will check azp/aud manually):', msg.substring(0, 80))
        await jwtVerify(token, JWKS, { issuer: verifyIssuer })
        if (!hasValidAud && (tokenAzp || audList.length > 0)) {
          throw new Error(
            `Token audience mismatch. Expected one of: ${acceptableAudiences.join(', ')}, Got azp: ${tokenAzp}, aud: ${JSON.stringify(tokenAud)}`
          )
        }
        logger.info('Token verification successful (signature + issuer, audience ok)')
        return payload
      }
      throw firstError
    }
  } catch (error) {
    const errorMessage = error?.message || 'Unknown error'
    const errorName = error?.name || 'Unknown'
    const errorCode = error?.code || 'Unknown'

    // If token is expired, throw a specific error that can be caught for refresh
    if (errorCode === 'ERR_JWT_EXPIRED' || errorName === 'JWTExpired' || errorMessage.includes('expired')) {
      logger.info('Token expired, will attempt refresh in middleware')
      const expiredError = new Error('Token expired')
      expiredError.name = 'JWTExpired'
      expiredError.code = 'ERR_JWT_EXPIRED'
      throw expiredError
    }

    logger.error('Token verification failed:', errorMessage)
    logger.error('Error name:', errorName)
    logger.error('Error code:', errorCode)
    if (error?.stack) logger.error('Stack:', error.stack)
    throw new Error('Invalid token')
  }
}

// Get user info from Keycloak
export async function getUserInfo(accessToken) {
  try {
    const { KEYCLOAK_BASE_URL, KEYCLOAK_REALM } = getKeycloakValues()
    const USERINFO_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`

    const response = await axios.get(USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: KEYCLOAK_HTTP_TIMEOUT_MS,
    })

    return response.data
  } catch (error) {
    logger.error('Error getting user info:', error.message)
    throw error
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
    logger.error('Error revoking token:', error)
    return false
  }
}

// Generate authorization URL
export async function getAuthorizationUrl(redirectUri, state) {
  const { KEYCLOAK_BASE_URL, KEYCLOAK_REALM, KEYCLOAK_CLIENT_ID } = getKeycloakValues()

  // Construct authorization endpoint directly
  const authorizationEndpoint = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
  })

  return `${authorizationEndpoint}?${params.toString()}`
}
