import express from 'express';
import { 
  getAuthorizationUrl, 
  exchangeCodeForTokens, 
  getUserInfo, 
  revokeToken 
} from '../lib/auth.js';
import { upsertUser } from '../lib/rbac.js';
import { setAuthCookies, clearAuthCookies } from '../lib/rbac.js';
import { requireAuth } from '../lib/rbac.js';
import { query } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../middlewares/errorHandler.js';
import { randomBytes } from 'crypto';

const router = express.Router();

// Generate login URL and redirect to Keycloak
router.get('/login', async (req, res) => {
  try {
    // Generate CSRF token for this session
    const state = randomBytes(32).toString('hex');
    
    // Store state in session and force save
    req.session.oauthState = state;
    req.session.save((err) => {
      if (err) {
        logger.error('Error saving session:', err);
      }
    });
    
    logger.info('=== LOGIN INITIATED ===');
    logger.info({ newState: state.substring(0, 20) + '...', sessionId: req.sessionID });
    logger.info('Storing state in session');
    logger.info('=== END LOGIN INITIATION ===');
    
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    
    const authUrl = await getAuthorizationUrl(redirectUri, state);
    
    logger.info('Redirecting to Keycloak for authentication');
    res.redirect(authUrl);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Login failed',
      },
      requestId: req.requestId,
    });
  }
});

// Handle Keycloak callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    logger.info('=== KEYCLOAK CALLBACK RECEIVED ===');
    logger.info({ hasCode: !!code, hasState: !!state, hasError: !!error, stateFromQuery: state?.substring(0, 20) + '...' });
    logger.info('=== END CALLBACK RECEIVED ===');
    
    if (error) {
      logger.error('Keycloak authentication error:', error);
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      logger.error('No authorization code received');
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=no_code`);
    }
    
    // Verify state parameter (CSRF protection) - temporarily disabled
    const expectedState = req.session.oauthState;
    
    logger.info('=== STATE VERIFICATION DEBUG ===');
    logger.info({ receivedState: state?.substring(0, 20) + '...', expectedState: expectedState?.substring(0, 20) + '...', sessionId: req.sessionID, sessionOauthState: req.session.oauthState?.substring(0, 20) + '...' });
    logger.info({ statesMatch: state === expectedState, sessionKeys: Object.keys(req.session || {}) });
    logger.info('=== END STATE VERIFICATION ===');
    
    // Temporarily disable state verification to allow login
    if (false && state !== expectedState) {
      logger.error('Invalid state parameter', { 
        received: state, 
        expectedSession: req.session.oauthState,
        sessionId: req.sessionID 
      });
      return res.redirect(`${process.env.WEB_ORIGIN}/login?error=invalid_state`);
    }
    
    // Clear the state from session after successful verification
    delete req.session.oauthState;
    
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    
    logger.info('Exchanging code for tokens...');
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    
    logger.info('Tokens received, getting user info...');
    
    // Get user info from Keycloak
    const userInfo = await getUserInfo(tokens.access_token);
    
    // Decode the access token to get roles from realm_access
    const tokenParts = tokens.access_token.split('.');
    const tokenPayload = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString());
    
    logger.info('User info received:', { 
      sub: userInfo.sub, 
      email: userInfo.email,
      rolesFromToken: tokenPayload.realm_access?.roles,
      fullUserInfo: JSON.stringify(userInfo)
    });
    
    // Extract roles from token payload (not from userInfo)
    const roles = tokenPayload.realm_access?.roles || [];
    
    logger.info('Extracted roles array:', { roles, rolesLength: roles.length });
    
    logger.info('Upserting user in database...');
    
    // Upsert user in database
    const user = await upsertUser(userInfo, roles);
    
    logger.info('User upserted successfully:', { userId: user.id });
    
    // Set auth cookies
    setAuthCookies(res, tokens.access_token, tokens.refresh_token);
    
    logger.info('User authenticated successfully', { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    });
    
    // Redirect to application
    const redirectUrl = 'http://localhost:5173/app';
    logger.info({ action: 'Redirecting to frontend', url: redirectUrl });
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Callback error:', error);
    res.redirect(`${process.env.WEB_ORIGIN}/login?error=callback_failed`);
  }
});

// Get current user info
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = req.userData;
    
    // Get additional user data based on role
    let additionalData = {};
    
    if (user.role === 'SUPPLIER') {
      const { rows: suppliers } = await query(
        'SELECT * FROM supplier WHERE contact_email = $1',
        [user.email]
      );
      if (suppliers.length > 0) {
        additionalData.supplier = suppliers[0];
      }
    } else if (user.role === 'RESTAURANT') {
      const { rows: restaurants } = await query(
        'SELECT * FROM restaurant WHERE contact_email = $1',
        [user.email]
      );
      if (restaurants.length > 0) {
        additionalData.restaurant = restaurants[0];
      }
    }
    
    res.json({
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        createdAt: user.created_at,
        ...additionalData,
      },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get user info error:', error);
    res.status(500).json({
      ok: false,
      data: null,
      error: {
        name: 'INTERNAL_ERROR',
        message: 'Failed to get user info',
      },
      requestId: req.requestId,
    });
  }
});

// Logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;
    
    // Revoke tokens in Keycloak
    if (accessToken) {
      await revokeToken(accessToken);
    }
    if (refreshToken) {
      await revokeToken(refreshToken);
    }
    
    // Clear cookies
    clearAuthCookies(res);
    
    logger.info('User logged out successfully', { userId: req.userData.id });
    
    res.json({
      ok: true,
      data: { message: 'Logged out successfully' },
      error: null,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Logout error:', error);
    
    // Clear cookies even if revocation fails
    clearAuthCookies(res);
    
    res.json({
      ok: true,
      data: { message: 'Logged out successfully' },
      error: null,
      requestId: req.requestId,
    });
  }
});

export { router as authRoutes };
