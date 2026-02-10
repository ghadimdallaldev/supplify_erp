import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireAuth,
  requireRole,
  requireOwnership,
  getUserBySub,
  upsertUser,
  setAuthCookies,
  clearAuthCookies,
} from './rbac.js';

vi.mock('./db.js', () => ({
  query: vi.fn(),
}));

vi.mock('./auth.js', () => ({
  verifyToken: vi.fn(),
  refreshAccessToken: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RBAC Utilities', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      cookies: {},
      user: null,
      userData: null,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    next = vi.fn();
  });

  describe('requireAuth', () => {
    it('should allow authenticated user', async () => {
      req.cookies = { access_token: 'valid-token' };
      req.requestId = 'test-request-id';
      
      const { verifyToken } = await import('./auth.js');
      const { query } = await import('./db.js');
      
      verifyToken.mockResolvedValueOnce({ sub: 'sub-123' });
      query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'test@example.com', keycloak_sub: 'sub-123' }],
      });

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated user', async () => {
      req.cookies = {};
      req.requestId = 'test-request-id';

      await requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should allow user with required role', () => {
      req.userData = { role: 'RESTAURANT' };
      const middleware = requireRole(['RESTAURANT', 'SUPPLIER']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      req.userData = { role: 'RESTAURANT' };
      const middleware = requireRole(['ADMIN']);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireOwnership', () => {
    it('should allow owner access', () => {
      req.userData = { id: 'user-1', role: 'RESTAURANT' };
      req.requestId = 'test-request-id';

      const middleware = requireOwnership('RESTAURANT');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject non-owner access', () => {
      req.userData = { id: 'user-1', role: 'RESTAURANT' };
      req.requestId = 'test-request-id';

      const middleware = requireOwnership('SUPPLIER');
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow admin access to any resource', () => {
      req.userData = { id: 'user-1', role: 'ADMIN' };
      req.requestId = 'test-request-id';

      const middleware = requireOwnership('SUPPLIER');
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getUserBySub', () => {
    it('should return user by Keycloak sub', async () => {
      const { query } = await import('./db.js');
      query.mockResolvedValueOnce({
        rows: [{ id: 'user-1', keycloak_sub: 'sub-123', email: 'test@example.com' }],
      });

      const user = await getUserBySub('sub-123');

      expect(user).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM app_user WHERE keycloak_sub = $1',
        ['sub-123']
      );
    });

    it('should return null for non-existent user', async () => {
      const { query } = await import('./db.js');
      query.mockResolvedValueOnce({
        rows: [],
      });

      const user = await getUserBySub('non-existent');

      expect(user).toBeNull();
      expect(query).toHaveBeenCalledWith(
        'SELECT * FROM app_user WHERE keycloak_sub = $1',
        ['non-existent']
      );
    });
  });

  describe('setAuthCookies', () => {
    it('should set access and refresh token cookies', () => {
      setAuthCookies(res, 'access-token', 'refresh-token');

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.objectContaining({
          httpOnly: true,
        })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
        })
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('should clear auth cookies', () => {
      clearAuthCookies(res);

      expect(res.clearCookie).toHaveBeenCalledWith('access_token');
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
    });
  });
});
