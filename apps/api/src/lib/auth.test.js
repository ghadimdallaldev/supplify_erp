import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfo,
  verifyToken,
  refreshAccessToken,
} from './auth.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../config/env.js', () => ({
  config: {
    KEYCLOAK_BASE_URL: 'http://keycloak.example.com',
    KEYCLOAK_REALM: 'Supplify',
    KEYCLOAK_CLIENT_ID: 'supplify-api',
    KEYCLOAK_CLIENT_SECRET: 'secret',
  },
}));

vi.mock('jose', () => ({
  jwtVerify: vi.fn().mockResolvedValue({
    payload: {
      sub: 'user-sub-123',
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      azp: 'supplify-api',
    },
  }),
  createRemoteJWKSet: vi.fn().mockReturnValue({}),
}));

vi.mock('./keycloak-config.js', () => ({
  getKeycloakConfig: vi.fn().mockResolvedValue({
    issuer: 'http://keycloak.example.com/realms/Supplify',
    jwks_uri: 'http://keycloak.example.com/realms/Supplify/protocol/openid-connect/certs',
  }),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Auth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate Keycloak authorization URL', async () => {
      const url = await getAuthorizationUrl('http://localhost/callback', 'state-123');

      expect(url).toContain('keycloak');
      expect(url).toContain('state-123');
      expect(url).toContain('redirect_uri');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      const axios = (await import('axios')).default;
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
      });

      const tokens = await exchangeCodeForTokens('code-123', 'http://localhost/callback');

      expect(tokens.access_token).toBe('access-token');
      expect(tokens.refresh_token).toBe('refresh-token');
    });
  });

  describe('getUserInfo', () => {
    it('should fetch user info from Keycloak', async () => {
      const axios = (await import('axios')).default;
      axios.get.mockResolvedValueOnce({
        data: {
          sub: 'user-sub-123',
          email: 'test@example.com',
          preferred_username: 'testuser',
        },
      });

      const userInfo = await getUserInfo('access-token');

      expect(userInfo.email).toBe('test@example.com');
      expect(userInfo.sub).toBe('user-sub-123');
    });
  });

  describe('verifyToken', () => {
    it('should verify JWT token', async () => {
      // Create a valid JWT-like token (header.payload.signature)
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({
        sub: 'user-sub-123',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        azp: 'supplify-api',
      })).toString('base64url');
      const token = `${header}.${payload}.signature`;

      const result = await verifyToken(token);

      expect(result).toBeDefined();
      expect(result.sub).toBe('user-sub-123');
      expect(result.email).toBe('test@example.com');
    });
  });
});
