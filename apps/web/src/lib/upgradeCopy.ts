/**
 * One-line value propositions and plan names for gated features/limits.
 * Used for tooltips and "Why upgrade?" messaging (non-technical).
 */
export const FEATURE_UPGRADE_COPY: Record<string, { plan: string; value: string }> = {
  reports: {
    plan: 'Gold',
    value: 'Upgrade to Gold to unlock reports and see usage and cost trends.',
  },
  quick_lists: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to save recurring orders as quick lists and schedule reorders.',
  },
  smart_reorder: {
    plan: 'Gold',
    value: 'Upgrade to Gold to unlock smart reorder and reduce manual stock decisions.',
  },
  multi_branch: {
    plan: 'Gold',
    value: 'Upgrade to Gold to unlock multi-branch inventory and avoid manual sync.',
  },
  chat: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to chat with more suppliers and send more messages.',
  },
}

export const LIMIT_UPGRADE_COPY: Record<string, { plan: string; value: string }> = {
  quick_lists: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze for more saved quick lists and scheduled reorders.',
  },
  quick_list_items: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to add more products to your quick lists.',
  },
  scheduled_quick_lists: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to schedule more recurring quick list orders.',
  },
  supplier_deals: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to browse supplier deals and save at checkout.',
  },
  orders_per_day: {
    plan: 'Gold',
    value: 'Upgrade to Gold for more daily orders so your team is never blocked.',
  },
  chats_per_day: {
    plan: 'Gold',
    value: 'Upgrade to Gold for more daily messages and smoother supplier communication.',
  },
  branches: {
    plan: 'Gold',
    value: 'Upgrade to Gold to add more locations and manage inventory per branch.',
  },
  warehouses: {
    plan: 'Bronze',
    value: 'Upgrade to Bronze to add warehouses and organize stock by location.',
  },
  restaurant_inventory_skus: {
    plan: 'Gold',
    value: 'Upgrade to Gold for more inventory SKUs and scale your catalog.',
  },
  supplier_products_skus: {
    plan: 'Gold',
    value: 'Upgrade to Gold for more products and a larger catalog.',
  },
  suppliers_per_restaurant: {
    plan: 'Gold',
    value: 'Upgrade to Gold to connect more suppliers and diversify ordering.',
  },
  users: {
    plan: 'Gold',
    value: 'Upgrade to Gold to add more team members and roles.',
  },
  storage_mb: {
    plan: 'Gold',
    value: 'Upgrade to Gold for more storage for images and documents.',
  },
}

export function getFeatureUpgradeCopy(featureKey: string): { plan: string; value: string } | null {
  return FEATURE_UPGRADE_COPY[featureKey] ?? null
}

export function getLimitUpgradeCopy(limitKey: string): { plan: string; value: string } | null {
  return LIMIT_UPGRADE_COPY[limitKey] ?? null
}
