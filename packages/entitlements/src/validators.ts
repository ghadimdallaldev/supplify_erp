import { z } from 'zod';

/**
 * Zod schemas for validating entitlements
 */

export const FeatureFlagsSchema = z.object({
  analyticsAdvanced: z.boolean(),
  promotions: z.boolean(),
  recommendationsBoost: z.boolean(),
  loyaltyAdvanced: z.boolean(),
  apiAccess: z.boolean(),
  webhooks: z.boolean(),
  inventoryModule: z.boolean(),
  pinnedProducts: z.boolean(),
  prioritySupport: z.boolean(),
});

export const LimitCapsSchema = z.object({
  products: z.number().int().nonnegative(),
  promotionsActive: z.number().int().nonnegative(),
  pinnedPerSupplier: z.number().int().nonnegative(),
  favoriteLists: z.number().int().nonnegative(),
  users: z.number().int().positive(),
  apiRateRps: z.number().int().positive(),
  storageGB: z.number().int().positive(),
});

export const EntitlementsSchema = z.object({
  features: FeatureFlagsSchema,
  limits: LimitCapsSchema,
});

export const PlanCodeSchema = z.enum(['BASIC', 'PRO', 'PREMIUM']);
export const OrgTypeSchema = z.enum(['SUPPLIER', 'RESTAURANT']);
export const SubscriptionStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'CANCELLED']);

/**
 * Validate entitlements object
 */
export function validateEntitlements(data: unknown) {
  return EntitlementsSchema.parse(data);
}

/**
 * Validate overrides (partial entitlements)
 */
export function validateOverrides(data: unknown) {
  return EntitlementsSchema.partial().partial({ features: true, limits: true }).parse(data);
}

