import {
  Entitlements,
  FeatureFlags,
  LimitCaps,
  PlanCode,
  PLAN_HIERARCHY,
  FeatureLockedError,
  LimitExceededError,
} from './types';

/**
 * Deep merge entitlements with overrides
 */
export function mergeEntitlements(
  base: Entitlements,
  overrides?: Partial<Entitlements>,
): Entitlements {
  if (!overrides) return base;

  return {
    features: {
      ...base.features,
      ...(overrides.features || {}),
    },
    limits: {
      ...base.limits,
      ...(overrides.limits || {}),
    },
  };
}

/**
 * Check if a feature is enabled
 */
export function hasFeature(
  entitlements: Entitlements,
  feature: keyof FeatureFlags,
): boolean {
  return entitlements.features[feature] === true;
}

/**
 * Check if current usage is within limit
 */
export function withinLimit(
  entitlements: Entitlements,
  limit: keyof LimitCaps,
  current: number,
): boolean {
  return current < entitlements.limits[limit];
}

/**
 * Get remaining capacity for a limit
 */
export function getRemainingCapacity(
  entitlements: Entitlements,
  limit: keyof LimitCaps,
  current: number,
): number {
  return Math.max(0, entitlements.limits[limit] - current);
}

/**
 * Calculate usage percentage for a limit
 */
export function getUsagePercentage(
  entitlements: Entitlements,
  limit: keyof LimitCaps,
  current: number,
): number {
  const cap = entitlements.limits[limit];
  if (cap === 0) return 100;
  return Math.min(100, Math.round((current / cap) * 100));
}

/**
 * Get suggested tier for a feature
 * Returns the lowest tier that has the feature
 */
export function getSuggestedTierForFeature(feature: keyof FeatureFlags): PlanCode {
  // This is a simplified version - in production, you'd query plans
  const featureMap: Record<keyof FeatureFlags, PlanCode> = {
    analyticsAdvanced: 'PRO',
    promotions: 'PRO',
    recommendationsBoost: 'PRO',
    loyaltyAdvanced: 'PREMIUM',
    apiAccess: 'PREMIUM',
    webhooks: 'PREMIUM',
    inventoryModule: 'PRO',
    pinnedProducts: 'BASIC', // Available on all tiers
    prioritySupport: 'PREMIUM',
  };

  return featureMap[feature];
}

/**
 * Get suggested tier for a limit increase
 * Returns the next tier up from current
 */
export function getSuggestedTierForLimit(currentTier: PlanCode): PlanCode {
  const currentLevel = PLAN_HIERARCHY[currentTier];

  if (currentLevel < PLAN_HIERARCHY.PRO) return 'PRO';
  if (currentLevel < PLAN_HIERARCHY.PREMIUM) return 'PREMIUM';

  return 'PREMIUM'; // Already at highest
}

/**
 * Compare two plan codes
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function comparePlans(a: PlanCode, b: PlanCode): number {
  return PLAN_HIERARCHY[a] - PLAN_HIERARCHY[b];
}

/**
 * Check if plan A includes plan B's features
 */
export function planIncludes(a: PlanCode, b: PlanCode): boolean {
  return PLAN_HIERARCHY[a] >= PLAN_HIERARCHY[b];
}

/**
 * Create a feature locked error
 */
export function createFeatureLockedError(
  feature: keyof FeatureFlags,
  currentTier: PlanCode,
): FeatureLockedError {
  return {
    error: 'FEATURE_LOCKED',
    feature,
    requiredTier: getSuggestedTierForFeature(feature),
    currentTier,
  };
}

/**
 * Create a limit exceeded error
 */
export function createLimitExceededError(
  limit: keyof LimitCaps,
  current: number,
  cap: number,
  currentTier: PlanCode,
): LimitExceededError {
  return {
    error: 'LIMIT_EXCEEDED',
    limit,
    current,
    cap,
    suggestedTier: getSuggestedTierForLimit(currentTier),
  };
}

/**
 * Format limit name for display
 */
export function formatLimitName(limit: keyof LimitCaps): string {
  const labels: Record<keyof LimitCaps, string> = {
    products: 'Active Products',
    promotionsActive: 'Active Promotions',
    pinnedPerSupplier: 'Pinned Products per Supplier',
    favoriteLists: 'Favorite Lists',
    users: 'Team Members',
    apiRateRps: 'API Rate (req/sec)',
    storageGB: 'Storage (GB)',
  };

  return labels[limit];
}

/**
 * Format feature name for display
 */
export function formatFeatureName(feature: keyof FeatureFlags): string {
  const labels: Record<keyof FeatureFlags, string> = {
    analyticsAdvanced: 'Advanced Analytics',
    promotions: 'Promotions & Campaigns',
    recommendationsBoost: 'Smart Recommendations',
    loyaltyAdvanced: 'Advanced Loyalty Programs',
    apiAccess: 'API Access',
    webhooks: 'Webhooks',
    inventoryModule: 'Inventory Management',
    pinnedProducts: 'Pinned Products',
    prioritySupport: 'Priority Support',
  };

  return labels[feature];
}

