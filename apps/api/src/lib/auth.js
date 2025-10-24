import { jwtVerify, SignJWT } from 'jose';
import { config } from '../config/env.js';
import { logger } from './logger.js';

const KEYCLOAK_BASE_URL = config.KEYCLOAK_BASE_URL;
const KEYCLOAK_REALM = config.KEYCLOAK_REALM;
const KEYCLOAK_CLIENT_ID = config.KEYCLOAK_CLIENT_ID;
const KEYCLOAK_CLIENT_SECRET = config.KEYCLOAK_CLIENT_SECRET;

// Keycloak endpoints
const WELL_KNOWN_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid_configuration`;
const TOKEN_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;
const USERINFO_URL = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`;

let keycloakConfig = null;

// Fetch Keycloak configuration
async function getKeycloakConfig() {
  if (keycloakConfig) {
    return keycloakConfig;
  }

  try {
    const response = await fetch(WELL_KNOWN_URL);
    keycloakConfig = await response.json();
    logger.info('Keycloak configuration loaded');
    return keycloakConfig;
  } catch (error) {
    logger.error('Failed to load Keycloak configuration:', error);
    throw new Error('Keycloak configuration unavailable');
  }
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code, redirectUri) {
  try {
    const config = await getKeycloakConfig();
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(config.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Token exchange failed:', error);
      throw new Error('Token exchange failed');
    }

    const tokens = await response.json();
    logger.info('Tokens exchanged successfully');
    return tokens;
  } catch (error) {
    logger.error('Error exchanging code for tokens:', error);
    throw error;
  }
}

// Refresh access token
export async function refreshAccessToken(refreshToken) {
  try {
    const config = await getKeycloakConfig();
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      refresh_token: refreshToken,
    });

    const response = await fetch(config.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      logger.warn('Token refresh failed');
      return null;
    }

    const tokens = await response.json();
    logger.info('Token refreshed successfully');
    return tokens;
  } catch (error) {
    logger.error('Error refreshing token:', error);
    return null;
  }
}

// Verify JWT token
export async function verifyToken(token) {
  try {
    const config = await getKeycloakConfig();
    
    // Get the public key from Keycloak
    const jwksResponse = await fetch(config.jwks_uri);
    const jwks = await jwksResponse.json();
    
    // Find the key that matches the token's kid
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
    const key = jwks.keys.find(k => k.kid === header.kid);
    
    if (!key) {
      throw new Error('Key not found');
    }

    // Import the key
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RS256', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Verify the token
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: config.issuer,
      audience: KEYCLOAK_CLIENT_ID,
    });

    return payload;
  } catch (error) {
    logger.error('Token verification failed:', error);
    throw new Error('Invalid token');
  }
}

// Get user info from Keycloak
export async function getUserInfo(accessToken) {
  try {
    const response = await fetch(USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await response.json();
    return userInfo;
  } catch (error) {
    logger.error('Error getting user info:', error);
    throw error;
  }
}

// Revoke token
export async function revokeToken(token) {
  try {
    const config = await getKeycloakConfig();
    
    const params = new URLSearchParams({
      client_id: KEYCLOAK_CLIENT_ID,
      client_secret: KEYCLOAK_CLIENT_SECRET,
      token,
    });

    const response = await fetch(config.revocation_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    return response.ok;
  } catch (error) {
    logger.error('Error revoking token:', error);
    return false;
  }
}

// Generate authorization URL
export async function getAuthorizationUrl(redirectUri, state) {
  const config = await getKeycloakConfig();
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KEYCLOAK_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid profile email',
    state,
  });

  return `${config.authorization_endpoint}?${params.toString()}`;
}
