"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeEntitlements = mergeEntitlements;
exports.hasFeature = hasFeature;
exports.withinLimit = withinLimit;
exports.getRemainingCapacity = getRemainingCapacity;
exports.getUsagePercentage = getUsagePercentage;
exports.getSuggestedTierForFeature = getSuggestedTierForFeature;
exports.getSuggestedTierForLimit = getSuggestedTierForLimit;
exports.comparePlans = comparePlans;
exports.planIncludes = planIncludes;
exports.createFeatureLockedError = createFeatureLockedError;
exports.createLimitExceededError = createLimitExceededError;
exports.formatLimitName = formatLimitName;
exports.formatFeatureName = formatFeatureName;
const types_1 = require("./types");
/**
 * Deep merge entitlements with overrides
 */
function mergeEntitlements(base, overrides) {
    if (!overrides)
        return base;
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
function hasFeature(entitlements, feature) {
    return entitlements.features[feature] === true;
}
/**
 * Check if current usage is within limit
 */
function withinLimit(entitlements, limit, current) {
    return current < entitlements.limits[limit];
}
/**
 * Get remaining capacity for a limit
 */
function getRemainingCapacity(entitlements, limit, current) {
    return Math.max(0, entitlements.limits[limit] - current);
}
/**
 * Calculate usage percentage for a limit
 */
function getUsagePercentage(entitlements, limit, current) {
    const cap = entitlements.limits[limit];
    if (cap === 0)
        return 100;
    return Math.min(100, Math.round((current / cap) * 100));
}
/**
 * Get suggested tier for a feature
 * Returns the lowest tier that has the feature
 */
function getSuggestedTierForFeature(feature) {
    // This is a simplified version - in production, you'd query plans
    const featureMap = {
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
function getSuggestedTierForLimit(currentTier) {
    const currentLevel = types_1.PLAN_HIERARCHY[currentTier];
    if (currentLevel < types_1.PLAN_HIERARCHY.PRO)
        return 'PRO';
    if (currentLevel < types_1.PLAN_HIERARCHY.PREMIUM)
        return 'PREMIUM';
    return 'PREMIUM'; // Already at highest
}
/**
 * Compare two plan codes
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function comparePlans(a, b) {
    return types_1.PLAN_HIERARCHY[a] - types_1.PLAN_HIERARCHY[b];
}
/**
 * Check if plan A includes plan B's features
 */
function planIncludes(a, b) {
    return types_1.PLAN_HIERARCHY[a] >= types_1.PLAN_HIERARCHY[b];
}
/**
 * Create a feature locked error
 */
function createFeatureLockedError(feature, currentTier) {
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
function createLimitExceededError(limit, current, cap, currentTier) {
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
function formatLimitName(limit) {
    const labels = {
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
function formatFeatureName(feature) {
    const labels = {
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
//# sourceMappingURL=utils.js.map