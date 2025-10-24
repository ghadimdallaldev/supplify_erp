import { z } from 'zod';
/**
 * Zod schemas for validating entitlements
 */
export declare const FeatureFlagsSchema: z.ZodObject<{
    analyticsAdvanced: z.ZodBoolean;
    promotions: z.ZodBoolean;
    recommendationsBoost: z.ZodBoolean;
    loyaltyAdvanced: z.ZodBoolean;
    apiAccess: z.ZodBoolean;
    webhooks: z.ZodBoolean;
    inventoryModule: z.ZodBoolean;
    pinnedProducts: z.ZodBoolean;
    prioritySupport: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    pinnedProducts?: boolean;
    analyticsAdvanced?: boolean;
    promotions?: boolean;
    recommendationsBoost?: boolean;
    loyaltyAdvanced?: boolean;
    apiAccess?: boolean;
    webhooks?: boolean;
    inventoryModule?: boolean;
    prioritySupport?: boolean;
}, {
    pinnedProducts?: boolean;
    analyticsAdvanced?: boolean;
    promotions?: boolean;
    recommendationsBoost?: boolean;
    loyaltyAdvanced?: boolean;
    apiAccess?: boolean;
    webhooks?: boolean;
    inventoryModule?: boolean;
    prioritySupport?: boolean;
}>;
export declare const LimitCapsSchema: z.ZodObject<{
    products: z.ZodNumber;
    promotionsActive: z.ZodNumber;
    pinnedPerSupplier: z.ZodNumber;
    favoriteLists: z.ZodNumber;
    users: z.ZodNumber;
    apiRateRps: z.ZodNumber;
    storageGB: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    products?: number;
    promotionsActive?: number;
    pinnedPerSupplier?: number;
    favoriteLists?: number;
    users?: number;
    apiRateRps?: number;
    storageGB?: number;
}, {
    products?: number;
    promotionsActive?: number;
    pinnedPerSupplier?: number;
    favoriteLists?: number;
    users?: number;
    apiRateRps?: number;
    storageGB?: number;
}>;
export declare const EntitlementsSchema: z.ZodObject<{
    features: z.ZodObject<{
        analyticsAdvanced: z.ZodBoolean;
        promotions: z.ZodBoolean;
        recommendationsBoost: z.ZodBoolean;
        loyaltyAdvanced: z.ZodBoolean;
        apiAccess: z.ZodBoolean;
        webhooks: z.ZodBoolean;
        inventoryModule: z.ZodBoolean;
        pinnedProducts: z.ZodBoolean;
        prioritySupport: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    }, {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    }>;
    limits: z.ZodObject<{
        products: z.ZodNumber;
        promotionsActive: z.ZodNumber;
        pinnedPerSupplier: z.ZodNumber;
        favoriteLists: z.ZodNumber;
        users: z.ZodNumber;
        apiRateRps: z.ZodNumber;
        storageGB: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    }, {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    }>;
}, "strip", z.ZodTypeAny, {
    features?: {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    };
    limits?: {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    };
}, {
    features?: {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    };
    limits?: {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    };
}>;
export declare const PlanCodeSchema: z.ZodEnum<["BASIC", "PRO", "PREMIUM"]>;
export declare const OrgTypeSchema: z.ZodEnum<["SUPPLIER", "RESTAURANT"]>;
export declare const SubscriptionStatusSchema: z.ZodEnum<["ACTIVE", "PAUSED", "CANCELLED"]>;
/**
 * Validate entitlements object
 */
export declare function validateEntitlements(data: unknown): {
    features?: {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    };
    limits?: {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    };
};
/**
 * Validate overrides (partial entitlements)
 */
export declare function validateOverrides(data: unknown): {
    features?: {
        pinnedProducts?: boolean;
        analyticsAdvanced?: boolean;
        promotions?: boolean;
        recommendationsBoost?: boolean;
        loyaltyAdvanced?: boolean;
        apiAccess?: boolean;
        webhooks?: boolean;
        inventoryModule?: boolean;
        prioritySupport?: boolean;
    };
    limits?: {
        products?: number;
        promotionsActive?: number;
        pinnedPerSupplier?: number;
        favoriteLists?: number;
        users?: number;
        apiRateRps?: number;
        storageGB?: number;
    };
};
//# sourceMappingURL=validators.d.ts.map