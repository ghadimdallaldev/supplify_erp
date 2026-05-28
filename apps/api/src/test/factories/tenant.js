/** @typedef {'RESTAURANT' | 'SUPPLIER' | 'ADMIN'} TenantType */

export function requestTenant(overrides = {}) {
  return {
    tenantId: 'restaurant-1',
    tenantType: 'RESTAURANT',
    tenantName: 'Test Tenant',
    ...overrides,
  }
}

export function tenantContext(overrides = {}) {
  return {
    tenantId: 'restaurant-1',
    tenantType: 'RESTAURANT',
    permissions: ['ORDERS_VIEW', 'ORDERS_CREATE', 'ORDERS_MANAGE', 'SETTINGS_VIEW'],
    ...overrides,
  }
}
