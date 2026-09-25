import { rolesIncludeOwner } from './tenant-roles.js'

const FINANCIAL_KEYS = ['tax_id', 'vat_number', 'vat_no', 'registration_number', 'trade_license_no']

function hasSettingsView(req) {
  const perms = req.tenantContext?.permissions ?? []
  return perms.includes('SETTINGS_VIEW') || perms.includes('SETTINGS_MANAGE')
}

function stripFinancialFields(row) {
  if (!row) return row
  const next = { ...row }
  for (const key of FINANCIAL_KEYS) {
    delete next[key]
  }
  return next
}

export function canSeeRestaurantFinancialProfile(req, row, { orgOwner = false } = {}) {
  if (req.userData?.role === 'ADMIN') return true
  if (orgOwner) return true
  if (req.userData?.role !== 'RESTAURANT') return false
  const tenantId = req.tenantContext?.tenantId
  if (row?.id && tenantId && row.id !== tenantId) return false
  if (rolesIncludeOwner(req.tenantContext?.roles)) return true
  return hasSettingsView(req)
}

export function presentRestaurant(req, row, options = {}) {
  if (!row || canSeeRestaurantFinancialProfile(req, row, options)) return row
  return stripFinancialFields(row)
}

export function canSeeSupplierFinancialProfile(req, row, { orgOwner = false } = {}) {
  if (req.userData?.role === 'ADMIN') return true
  if (orgOwner) return true
  if (req.userData?.role !== 'SUPPLIER') return false
  const tenantId = req.tenantContext?.tenantId
  if (!tenantId || row?.id !== tenantId) return false
  if (rolesIncludeOwner(req.tenantContext?.roles)) return true
  return hasSettingsView(req)
}

export function presentSupplier(req, row, options = {}) {
  if (!row || canSeeSupplierFinancialProfile(req, row, options)) return row
  return stripFinancialFields(row)
}

export function presentPublicSupplier(row) {
  return stripFinancialFields(row)
}
