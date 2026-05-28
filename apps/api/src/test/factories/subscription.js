/** @typedef {'RESTAURANT' | 'SUPPLIER'} TenantType */

export function subscriptionRow(overrides = {}) {
  return {
    id: 'sub-1',
    tenant_id: 'rest-1',
    tenant_type: 'RESTAURANT',
    plan_id: 'plan-free',
    plan_name: 'Free',
    plan_code: 'free',
    plan_display_name: 'Free',
    status: 'ACTIVE',
    limits: { chats_per_day: 10, orders_per_day: 3 },
    features: { chat: 'enabled' },
    pending_plan_id: null,
    pending_effective_at: null,
    ...overrides,
  }
}

export function subscriptionIdRow(overrides = {}) {
  return {
    id: 'sub-1',
    plan_id: 'plan-free',
    pending_plan_id: null,
    pending_effective_at: null,
    ...overrides,
  }
}

/**
 * Routes common subscription SQL to canned responses.
 * Unmatched queries return { rows: [] }.
 */
export function createSubscriptionQueryRouter(handlers = {}) {
  return async (sql, params) => {
    const text = typeof sql === 'string' ? sql : ''
    if (text.includes('organization_id') && handlers.orgBilling !== undefined) {
      return handlers.orgBilling
    }
    if (
      text.includes('pending_plan_id') &&
      text.includes('FROM subscription') &&
      handlers.pendingSub
    ) {
      return handlers.pendingSub
    }
    if (
      text.includes('FROM subscription s') &&
      text.includes('JOIN subscription_plan') &&
      handlers.fullSub
    ) {
      return typeof handlers.fullSub === 'function'
        ? handlers.fullSub(text, params)
        : handlers.fullSub
    }
    if (text.includes('FROM subscription') && text.includes('plan_id') && handlers.subId) {
      return handlers.subId
    }
    if (text.includes('subscription_plan') && handlers.plan) {
      return handlers.plan
    }
    if (text.includes('usage_meter') && handlers.usage) {
      return handlers.usage
    }
    if (text.includes('tenant_limit_override') || text.includes('plan_limit_override')) {
      return { rows: [] }
    }
    if (handlers.fallback) {
      return handlers.fallback(text, params)
    }
    return { rows: [] }
  }
}
