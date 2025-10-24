"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionStatusSchema = exports.OrgTypeSchema = exports.PlanCodeSchema = exports.EntitlementsSchema = exports.LimitCapsSchema = exports.FeatureFlagsSchema = void 0;
exports.validateEntitlements = validateEntitlements;
exports.validateOverrides = validateOverrides;
const zod_1 = require("zod");
/**
 * Zod schemas for validating entitlements
 */
exports.FeatureFlagsSchema = zod_1.z.object({
    analyticsAdvanced: zod_1.z.boolean(),
    promotions: zod_1.z.boolean(),
    recommendationsBoost: zod_1.z.boolean(),
    loyaltyAdvanced: zod_1.z.boolean(),
    apiAccess: zod_1.z.boolean(),
    webhooks: zod_1.z.boolean(),
    inventoryModule: zod_1.z.boolean(),
    pinnedProducts: zod_1.z.boolean(),
    prioritySupport: zod_1.z.boolean(),
});
exports.LimitCapsSchema = zod_1.z.object({
    products: zod_1.z.number().int().nonnegative(),
    promotionsActive: zod_1.z.number().int().nonnegative(),
    pinnedPerSupplier: zod_1.z.number().int().nonnegative(),
    favoriteLists: zod_1.z.number().int().nonnegative(),
    users: zod_1.z.number().int().positive(),
    apiRateRps: zod_1.z.number().int().positive(),
    storageGB: zod_1.z.number().int().positive(),
});
exports.EntitlementsSchema = zod_1.z.object({
    features: exports.FeatureFlagsSchema,
    limits: exports.LimitCapsSchema,
});
exports.PlanCodeSchema = zod_1.z.enum(['BASIC', 'PRO', 'PREMIUM']);
exports.OrgTypeSchema = zod_1.z.enum(['SUPPLIER', 'RESTAURANT']);
exports.SubscriptionStatusSchema = zod_1.z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);
/**
 * Validate entitlements object
 */
function validateEntitlements(data) {
    return exports.EntitlementsSchema.parse(data);
}
/**
 * Validate overrides (partial entitlements)
 */
function validateOverrides(data) {
    return exports.EntitlementsSchema.partial().partial({ features: true, limits: true }).parse(data);
}
//# sourceMappingURL=validators.js.map