import { requestLogStore } from './request-log-store.js'

/**
 * Backend identifiers for the current HTTP request (safe for logs — no tokens/email).
 */
export function buildRequestIdentifiers(req) {
  const userId = req.userData?.id ?? null
  const userSub = req.userSub ?? req.user?.sub ?? null
  const role = req.userData?.role ?? null

  let tenantId =
    req.tenantContext?.tenantId ??
    req.impersonationContext?.tenantId ??
    req.activeTenantContext?.tenantId ??
    null
  const tenantType =
    req.tenantContext?.tenantType ??
    req.impersonationContext?.tenantType ??
    req.activeTenantContext?.tenantType ??
    null

  const branchId = req.headers?.['x-branch-id'] ?? null
  const impersonating = Boolean(req.impersonationContext?.tenantId)
  const adminUserId = req.impersonationContext?.adminUserId ?? null

  return {
    requestId: req.requestId ?? '-',
    userId: userId ?? 'anon',
    userSub: userSub ?? '-',
    role: role ?? '-',
    tenantId: tenantId ?? '-',
    tenantType: tenantType ?? '-',
    branchId: branchId ?? '-',
    impersonating,
    ...(adminUserId ? { adminUserId } : {}),
  }
}

/** Human-readable suffix for request completion logs */
export function formatRequestLogTags(ids) {
  const parts = [`[req:${ids.requestId}]`, `[user:${ids.userId}]`]
  if (ids.userSub && ids.userSub !== '-') parts.push(`[sub:${ids.userSub}]`)
  if (ids.role && ids.role !== '-') parts.push(`[role:${ids.role}]`)
  if (ids.tenantId && ids.tenantId !== '-') {
    const tenantLabel = ids.tenantType && ids.tenantType !== '-' ? `${ids.tenantType}:` : ''
    parts.push(`[tenant:${tenantLabel}${ids.tenantId}]`)
  }
  if (ids.branchId && ids.branchId !== '-') parts.push(`[branch:${ids.branchId}]`)
  if (ids.impersonating && ids.adminUserId) parts.push(`[admin:${ids.adminUserId}]`)
  return parts.join(' ')
}

/**
 * Sync req identity into AsyncLocalStorage so logger.* during this request includes user/tenant ids.
 */
export function syncRequestLogContext(req) {
  const ids = buildRequestIdentifiers(req)
  const store = requestLogStore.getStore()
  if (store) {
    Object.assign(store, ids)
  }
  return ids
}
