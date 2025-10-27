import { randomBytes } from 'crypto';

// CSRF protection middleware
export function csrfProtection(req, res, next) {
  // Skip CSRF for auth endpoints (handled by Keycloak)
  if (req.path.startsWith('/auth/')) {
    return next();
  }

  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for health check
  if (req.path === '/health') {
    return next();
  }

  // Skip CSRF for API routes (handled by session cookies)
  if (req.path.startsWith('/api/')) {
    return next();
  }

  // Generate CSRF token if not exists
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(32).toString('hex');
  }

  // Add CSRF token to response locals
  res.locals.csrfToken = req.session.csrfToken;

  next();
}

// Middleware to add CSRF token to response
export function addCsrfToken(req, res, next) {
  res.json = function(data) {
    if (data && typeof data === 'object') {
      data.csrfToken = res.locals.csrfToken;
    }
    return res.json.call(this, data);
  };
  next();
}
