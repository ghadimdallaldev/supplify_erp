import { verifyToken, refreshAccessToken } from './auth.js';
import { query } from './db.js';
import { logger } from './logger.js';

// Extract token from cookie
export function extractTokenFromCookie(req) {
  return req.cookies.access_token;
}

// Extract refresh token from cookie
export function extractRefreshTokenFromCookie(req) {
  return req.cookies.refresh_token;
}

// Set auth cookies
export function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In development, use 'lax' for sameSite (works with http://localhost)
  const sameSite = 'lax';
  
  // Access token cookie (short-lived)
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction, // Must match sameSite requirements
    sameSite,
    maxAge: 60 * 60 * 1000, // 1 hour (increased from 5 minutes)
  });

  // Refresh token cookie (longer-lived)
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction, // Must match sameSite requirements
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

// Clear auth cookies
export function clearAuthCookies(res) {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
}

// Get user from database by Keycloak sub
export async function getUserBySub(sub) {
  try {
    const result = await query(
      'SELECT * FROM app_user WHERE keycloak_sub = $1',
      [sub]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting user by sub', { error: error.message });
    throw error;
  }
}

// Create or update user in database
export async function upsertUser(userInfo, roles = []) {
  try {
    const { sub, email, given_name, family_name } = userInfo;
    const displayName = `${given_name || ''} ${family_name || ''}`.trim() || email;
    
    logger.debug('Upserting user', { sub });
    
    // Normalize to lowercase for comparison (Keycloak may return different casing)
    const rolesLower = (roles || []).map((r) => String(r).toLowerCase());
    const hasRole = (name) => rolesLower.includes(name.toLowerCase());

    // Determine role from Keycloak roles (admin > supplier > restaurant)
    let role = 'RESTAURANT'; // default
    if (hasRole('admin')) {
      role = 'ADMIN';
    } else if (hasRole('supplier')) {
      role = 'SUPPLIER';
    } else {
      const emailLower = (email || '').toLowerCase();
      if (emailLower === 'admin@supplify.com') role = 'ADMIN';
      else if (emailLower === 'supplier@supplify.com') role = 'SUPPLIER';
      else role = 'RESTAURANT';
    }

    const result = await query(`
      INSERT INTO app_user (keycloak_sub, email, display_name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (keycloak_sub) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        updated_at = now()
      RETURNING *
    `, [sub, email, displayName, role]);

    logger.debug('User upserted', { userId: result.rows[0]?.id, role });
    return result.rows[0];
  } catch (error) {
    logger.error('Error upserting user', { error: error.message });
    throw error;
  }
}

// Authentication middleware
export async function requireAuth(req, res, next) {
  try {
    const accessToken = extractTokenFromCookie(req);
    
    if (!accessToken) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'No access token provided',
        },
        requestId: req.requestId,
      });
    }

    try {
      // Verify the access token
      const payload = await verifyToken(accessToken);
      req.user = payload;
      req.userSub = payload.sub;
      
      // Get user from database
      const user = await getUserBySub(payload.sub);
      if (!user) {
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'User not found',
          },
          requestId: req.requestId,
        });
      }
      
      req.userData = user;
      next();
    } catch (error) {
      logger.debug('Token verification failed, attempting refresh');
      
      // Token is invalid or expired, try to refresh
      const refreshToken = extractRefreshTokenFromCookie(req);
      
      if (!refreshToken) {
        logger.debug('No refresh token available');
        clearAuthCookies(res);
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'Invalid token and no refresh token',
          },
          requestId: req.requestId,
        });
      }

      // Attempt to refresh the token
      logger.debug('Attempting to refresh token');
      const newTokens = await refreshAccessToken(refreshToken);
      
      if (!newTokens) {
        logger.warn('Token refresh returned null');
        clearAuthCookies(res);
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'Token refresh failed',
          },
          requestId: req.requestId,
        });
      }
      
      logger.debug('Token refresh successful');

      // Set new cookies
      setAuthCookies(res, newTokens.access_token, newTokens.refresh_token);
      
      // Verify the new token
      const payload = await verifyToken(newTokens.access_token);
      req.user = payload;
      req.userSub = payload.sub;
      
      // Get user from database
      const user = await getUserBySub(payload.sub);
      if (!user) {
        return res.status(401).json({
          ok: false,
          data: null,
          error: {
            name: 'UNAUTHORIZED',
            message: 'User not found',
          },
          requestId: req.requestId,
        });
      }
      
      req.userData = user;
      next();
    }
  } catch (error) {
    logger.error('Authentication error', { error: error.message });
    clearAuthCookies(res);
    return res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      },
      requestId: req.requestId,
    });
  }
}

// Optional authentication middleware - doesn't fail if token is missing, but sets req.userData if available
export async function optionalAuth(req, res, next) {
  try {
    const accessToken = extractTokenFromCookie(req);
    
    if (!accessToken) {
      // No token, continue without authentication
      return next();
    }

    try {
      // Verify the access token
      const payload = await verifyToken(accessToken);
      req.user = payload;
      req.userSub = payload.sub;
      
      // Get user from database
      const user = await getUserBySub(payload.sub);
      if (user) {
        req.userData = user;
      }
    } catch (error) {
      // Token is invalid or expired, try to refresh
      const refreshToken = extractRefreshTokenFromCookie(req);
      
      if (refreshToken) {
        try {
          const newTokens = await refreshAccessToken(refreshToken);
          
          if (newTokens) {
            // Set new cookies
            setAuthCookies(res, newTokens.access_token, newTokens.refresh_token);
            
            // Verify the new token
            const payload = await verifyToken(newTokens.access_token);
            req.user = payload;
            req.userSub = payload.sub;
            
            // Get user from database
            const user = await getUserBySub(payload.sub);
            if (user) {
              req.userData = user;
            }
          }
        } catch (refreshError) {
          // Refresh failed, continue without authentication
          logger.debug('Token refresh failed in optionalAuth, continuing without auth');
        }
      }
    }
    
    next();
  } catch (error) {
    // If anything fails, just continue without authentication
    logger.debug('Optional auth error, continuing without auth:', error.message);
    next();
  }
}

// Role-based access control middleware
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        requestId: req.requestId,
      });
    }

    const userRole = req.userData.role;
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: `Access denied. Required roles: ${roles.join(', ')}`,
        },
        requestId: req.requestId,
      });
    }

    next();
  };
}

// Check if user owns resource (for suppliers/restaurants)
export function requireOwnership(ownerType) {
  return (req, res, next) => {
    if (!req.userData) {
      return res.status(401).json({
        ok: false,
        data: null,
        error: {
          name: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        requestId: req.requestId,
      });
    }

    const userRole = req.userData.role;
    
    // Admin can access everything
    if (userRole === 'ADMIN') {
      return next();
    }

    // Check if user role matches the required ownership type
    if (ownerType === 'SUPPLIER' && userRole !== 'SUPPLIER') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. Supplier ownership required',
        },
        requestId: req.requestId,
      });
    }

    if (ownerType === 'RESTAURANT' && userRole !== 'RESTAURANT') {
      return res.status(403).json({
        ok: false,
        data: null,
        error: {
          name: 'FORBIDDEN',
          message: 'Access denied. Restaurant ownership required',
        },
        requestId: req.requestId,
      });
    }

    next();
  };
}
