/**
 * One-line value propositions and plan names for gated features/limits.
 * Used for tooltips and "Why upgrade?" messaging (non-technical).
 */
export const FEATURE_UPGRADE_COPY: Record<string, { plan: string; value: string }> = {
  reports: {
    plan: 'Scale',
    value: 'Upgrade to Scale for advanced reports, controls, and operational analytics.',
  },
  quick_lists: {
    plan: 'Growth',
    value: 'Activate Growth to save recurring orders as quick lists and schedule reorders.',
  },
  smart_reorder: {
    plan: 'Growth',
    value: 'Activate Growth to unlock reorder forecasting and AI-assisted purchasing.',
  },
  multi_branch: {
    plan: 'Scale',
    value: 'Upgrade to Scale for multi-location purchasing and inventory controls.',
  },
  chat: {
    plan: 'Growth',
    value: 'Activate Growth to chat with suppliers and keep ordering conversations in Supplify.',
  },
}

export const LIMIT_UPGRADE_COPY: Record<string, { plan: string; value: string }> = {
  quick_lists: {
    plan: 'Growth',
    value: 'Activate Growth for more saved quick lists and scheduled reorders.',
  },
  quick_list_items: {
    plan: 'Growth',
    value: 'Activate Growth to add more products to your quick lists.',
  },
  scheduled_quick_lists: {
    plan: 'Growth',
    value: 'Activate Growth to schedule more recurring quick list orders.',
  },
  supplier_deals: {
    plan: 'Growth',
    value: 'Activate Growth to browse and redeem supplier deals at checkout.',
  },
  deal_redemptions_per_day: {
    plan: 'Growth',
    value: 'Activate Growth for normal supplier deal redemptions under fair use.',
  },
  promotions: {
    plan: 'Supplier Scale',
    value: 'Upgrade to Supplier Scale for more active deals on your catalog.',
  },
  open_conversations: {
    plan: 'Scale',
    value: 'Upgrade to Scale for more open conversations across your operation.',
  },
  orders_per_day: {
    plan: 'Growth',
    value: 'Paid restaurant plans do not commercially cap normal ordering volume.',
  },
  chats_per_day: {
    plan: 'Scale',
    value: 'Upgrade to Scale for higher daily messaging capacity and advanced operations.',
  },
  branches: {
    plan: 'Scale',
    value: 'Upgrade to Scale to add more active operating locations.',
  },
  warehouses: {
    plan: 'Supplier Growth',
    value: 'Activate Supplier Growth to add your first warehouse.',
  },
  active_customer_locations_monthly: {
    plan: 'Supplier Scale',
    value:
      'Upgrade to Supplier Scale or add customer-location capacity for more active ordering locations.',
  },
  restaurant_inventory_skus: {
    plan: 'Growth',
    value: 'Paid restaurant plans include inventory SKUs under fair use.',
  },
  supplier_products_skus: {
    plan: 'Supplier Growth',
    value: 'Paid supplier plans include product SKUs under fair use.',
  },
  suppliers_per_restaurant: {
    plan: 'Growth',
    value: 'Paid restaurant plans let you connect suppliers under fair use.',
  },
  users: {
    plan: 'Scale',
    value: 'Upgrade to Scale to add more team members and advanced roles.',
  },
  storage_mb: {
    plan: 'Scale',
    value: 'Upgrade to Scale for more storage and advanced operational capacity.',
  },
}

export function getFeatureUpgradeCopy(featureKey: string): { plan: string; value: string } | null {
  return FEATURE_UPGRADE_COPY[featureKey] ?? null
}

export function getLimitUpgradeCopy(limitKey: string): { plan: string; value: string } | null {
  return LIMIT_UPGRADE_COPY[limitKey] ?? null
}
