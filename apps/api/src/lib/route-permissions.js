/**
 * Reusable route middleware for least-privilege RBAC after router-level *_VIEW gates.
 */
import { requirePermission, requireAnyPermission } from './rbac.js'
import { PERMISSION_KEYS as P } from './permission-keys.js'

export { requirePermission, requireAnyPermission, P }

/** After STAFF_VIEW: enforce write tiers on mutations. */
export function staffMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  if (method === 'DELETE') {
    return requirePermission(P.STAFF_MANAGE)(req, res, next)
  }
  if (method === 'POST' && /\/members\/?$/.test(req.path)) {
    return requireAnyPermission(P.STAFF_INVITE, P.STAFF_MANAGE)(req, res, next)
  }
  return requireAnyPermission(P.STAFF_EDIT, P.STAFF_MANAGE)(req, res, next)
}

/** After RESERVATIONS_VIEW. */
export function reservationsMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  if (method === 'DELETE') {
    return requirePermission(P.RESERVATIONS_MANAGE)(req, res, next)
  }
  if (method === 'POST') {
    return requireAnyPermission(P.RESERVATIONS_CREATE, P.RESERVATIONS_MANAGE)(req, res, next)
  }
  return requireAnyPermission(P.RESERVATIONS_EDIT, P.RESERVATIONS_MANAGE)(req, res, next)
}

/** After INVOICES_VIEW. */
export function invoicesMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  if (method === 'POST') {
    return requireAnyPermission(P.INVOICES_CREATE, P.INVOICES_MANAGE)(req, res, next)
  }
  return requireAnyPermission(P.INVOICES_EDIT, P.INVOICES_MANAGE)(req, res, next)
}

/** After SETTINGS_VIEW: branch/org structural changes only (not tenant switch). */
export function settingsMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  if (method === 'POST' && (req.path === '/switch' || req.path.endsWith('/switch'))) {
    return next()
  }
  return requirePermission(P.SETTINGS_MANAGE)(req, res, next)
}

/** After ORDERS_VIEW on quick-lists. */
export function ordersCreateMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  return requireAnyPermission(P.ORDERS_CREATE, P.ORDERS_MANAGE)(req, res, next)
}

/**
 * After ORDERS_VIEW on /api/orders: enforce write permissions on mutations.
 * POST create (/, /manual) requires ORDERS_CREATE or ORDERS_MANAGE.
 * PATCH/PUT/DELETE require ORDERS_EDIT, ORDERS_MANAGE, or ORDERS_CREATE.
 */
export function ordersRouterMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const path = req.path || ''
  if (method === 'POST' && /\/remind$/.test(path)) {
    return next()
  }
  if (method === 'POST' && /\/location$/.test(path)) {
    return next()
  }
  if (method === 'POST') {
    return requireAnyPermission(P.ORDERS_CREATE, P.ORDERS_MANAGE)(req, res, next)
  }
  return requireAnyPermission(P.ORDERS_EDIT, P.ORDERS_MANAGE, P.ORDERS_CREATE)(req, res, next)
}

/** Resolve granular admin-dashboard permission from request path (after resolveAdminContext). */
export function resolveAdminDashboardPermission(path) {
  const p = path || ''
  if (p.startsWith('/financial-overview')) return P.ADMIN_FINANCE
  if (
    p.startsWith('/plans') ||
    p.startsWith('/subscriptions') ||
    p.startsWith('/usage') ||
    p.startsWith('/limit-keys') ||
    p.startsWith('/limit-overrides') ||
    p.includes('/override-limit') ||
    p.startsWith('/plan-overrides') ||
    p.includes('/subscription-addons') ||
    p.includes('/effective-limit')
  ) {
    return P.ADMIN_PLANS
  }
  if (p.startsWith('/operational')) return P.ADMIN_ACCESS
  if (p.startsWith('/tenants')) return P.ADMIN_TENANTS
  if (p.startsWith('/users')) return P.ADMIN_SUPPORT
  if (p.startsWith('/impersonate')) return P.ADMIN_SUPPORT
  if (p.startsWith('/feature-flags') || p.includes('/feature-overrides')) return P.ADMIN_GROWTH
  return P.ADMIN_ACCESS
}

/** Per-tab admin API guard (SUPER_ADMIN has all keys; scoped admins only matching tabs). */
export function adminDashboardPermissionGuard(req, res, next) {
  const key = resolveAdminDashboardPermission(req.path)
  return requirePermission(key)(req, res, next)
}

/** After CHAT_VIEW. */
export function chatSendGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  const path = req.path || ''
  if (
    (method === 'PATCH' || method === 'PUT') &&
    (path.endsWith('/read') || path.includes('/read'))
  ) {
    return next()
  }
  return requireAnyPermission(P.CHAT_SEND, P.CHAT_MANAGE)(req, res, next)
}

/** Billing/subscription routes. */
export function billingAccessGuard(req, res, next) {
  const method = req.method.toUpperCase()
  const path = req.path || ''
  if ((method === 'GET' || method === 'HEAD' || method === 'OPTIONS') && path === '/status') {
    return next()
  }
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requireAnyPermission(P.SUBSCRIPTIONS_VIEW, P.SETTINGS_MANAGE)(req, res, next)
  }
  return requirePermission(P.SUBSCRIPTIONS_MANAGE)(req, res, next)
}

/** Skip billing guard for self-serve entitlement/limit reads (any authenticated tenant). */
export function subscriptionRouteGuard(req, res, next) {
  const path = req.path || ''
  if (
    path === '/entitlements' ||
    path === '/current' ||
    path === '/plans' ||
    path === '/recommendation' ||
    path === '/conversion-event'
  ) {
    return next()
  }
  return billingAccessGuard(req, res, next)
}

/** Multi-branch org routes (restaurant-org / supplier org). */
export function orgStructureGuard(req, res, next) {
  const method = req.method.toUpperCase()
  const path = req.path || ''
  if (path === '/context/switch' || path.endsWith('/context/switch')) {
    return requirePermission(P.SETTINGS_VIEW)(req, res, next)
  }
  if (path.startsWith('/users')) {
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return requirePermission(P.STAFF_VIEW)(req, res, next)
    }
    return requireAnyPermission(P.STAFF_MANAGE, P.SETTINGS_MANAGE)(req, res, next)
  }
  if (
    (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') &&
    (path === '/' || path === '/branches' || path.startsWith('/branches/'))
  ) {
    return next()
  }
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission(P.SETTINGS_VIEW)(req, res, next)
  }
  return requirePermission(P.SETTINGS_MANAGE)(req, res, next)
}

/** Authenticated supplier review routes (after ORDERS_VIEW on reads). */
export function reviewsAccessGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return requirePermission(P.ORDERS_VIEW)(req, res, next)
  }
  return requireAnyPermission(P.ORDERS_CREATE, P.ORDERS_EDIT, P.ORDERS_MANAGE)(req, res, next)
}

/** Presign / attach uploads tied to catalog, settings, staff, receiving, or invoices. */
export function filesUploadGuard(req, res, next) {
  return requireAnyPermission(
    P.CATALOG_EDIT,
    P.CATALOG_MANAGE,
    P.SETTINGS_EDIT,
    P.SETTINGS_MANAGE,
    P.RECEIVING_MANAGE,
    P.STAFF_EDIT,
    P.STAFF_MANAGE,
    P.INVOICES_EDIT,
    P.INVOICES_MANAGE
  )(req, res, next)
}

/** Restaurant supplier relationship mutations (follow / block). */
export function restaurantSupplierMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next()
  return requireAnyPermission(P.ORDERS_CREATE, P.ORDERS_EDIT, P.ORDERS_MANAGE)(req, res, next)
}

/** Notification preferences and test sends. */
export function notificationsMutationGuard(req, res, next) {
  const method = req.method.toUpperCase()
  const path = req.path || ''
  if (method === 'PATCH' && path === '/preferences') {
    if (req.userData?.role === 'ADMIN' && !req.tenantContext?.tenantId) {
      return next()
    }
    return requireAnyPermission(P.SETTINGS_EDIT, P.SETTINGS_MANAGE)(req, res, next)
  }
  if (method === 'POST' && path === '/test') {
    return requirePermission(P.SETTINGS_MANAGE)(req, res, next)
  }
  return next()
}
