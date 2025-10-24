import { Entitlements, FeatureFlags, LimitCaps, PlanCode, FeatureLockedError, LimitExceededError } from './types';
/**
 * Deep merge entitlements with overrides
 */
export declare function mergeEntitlements(base: Entitlements, overrides?: Partial<Entitlements>): Entitlements;
/**
 * Check if a feature is enabled
 */
export declare function hasFeature(entitlements: Entitlements, feature: keyof FeatureFlags): boolean;
/**
 * Check if current usage is within limit
 */
export declare function withinLimit(entitlements: Entitlements, limit: keyof LimitCaps, current: number): boolean;
/**
 * Get remaining capacity for a limit
 */
export declare function getRemainingCapacity(entitlements: Entitlements, limit: keyof LimitCaps, current: number): number;
/**
 * Calculate usage percentage for a limit
 */
export declare function getUsagePercentage(entitlements: Entitlements, limit: keyof LimitCaps, current: number): number;
/**
 * Get suggested tier for a feature
 * Returns the lowest tier that has the feature
 */
export declare function getSuggestedTierForFeature(feature: keyof FeatureFlags): PlanCode;
/**
 * Get suggested tier for a limit increase
 * Returns the next tier up from current
 */
export declare function getSuggestedTierForLimit(currentTier: PlanCode): PlanCode;
/**
 * Compare two plan codes
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export declare function comparePlans(a: PlanCode, b: PlanCode): number;
/**
 * Check if plan A includes plan B's features
 */
export declare function planIncludes(a: PlanCode, b: PlanCode): boolean;
/**
 * Create a feature locked error
 */
export declare function createFeatureLockedError(feature: keyof FeatureFlags, currentTier: PlanCode): FeatureLockedError;
/**
 * Create a limit exceeded error
 */
export declare function createLimitExceededError(limit: keyof LimitCaps, current: number, cap: number, currentTier: PlanCode): LimitExceededError;
/**
 * Format limit name for display
 */
export declare function formatLimitName(limit: keyof LimitCaps): string;
/**
 * Format feature name for display
 */
export declare function formatFeatureName(feature: keyof FeatureFlags): string;
//# sourceMappingURL=utils.d.ts.map