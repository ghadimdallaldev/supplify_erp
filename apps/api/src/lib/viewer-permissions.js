/**
 * Workspace Viewer (RESTAURANT and SUPPLIER tenants, including Org Viewer):
 * all tenant-scoped *_VIEW permissions for that workspace type, zero writes.
 */
import { PERMISSION_KEYS as P } from './permission-keys.js'

const SUPPLIER_ONLY_VIEWS = new Set([P.WAREHOUSES_VIEW, P.FULFILLMENT_VIEW])
const RESTAURANT_ONLY_VIEWS = new Set([P.RESERVATIONS_VIEW])

const WRITE_SUFFIX = /_(CREATE|EDIT|SEND|MANAGE)$/

export function isWritePermission(code) {
  return WRITE_SUFFIX.test(code)
}

export function isViewPermission(code) {
  return typeof code === 'string' && code.endsWith('_VIEW') && !code.startsWith('ADMIN_')
}

/**
 * All workspace read permissions for a tenant type (no CREATE/EDIT/SEND/MANAGE).
 */
export function getWorkspaceViewPermissions(tenantType) {
  return Object.values(P).filter((code) => {
    if (!isViewPermission(code)) return false
    if (tenantType === 'RESTAURANT' && SUPPLIER_ONLY_VIEWS.has(code)) return false
    if (tenantType === 'SUPPLIER' && RESTAURANT_ONLY_VIEWS.has(code)) return false
    return true
  })
}

export function assertNoWritePermissions(permissions, label = 'role') {
  const writes = permissions.filter(isWritePermission)
  if (writes.length > 0) {
    throw new Error(`${label} must not include write permissions: ${writes.join(', ')}`)
  }
}
