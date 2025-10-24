/**
 * Shared types for subscription entitlements
 */

export type PlanCode = 'BASIC' | 'PRO' | 'PREMIUM';
export type OrgType = 'SUPPLIER' | 'RESTAURANT';
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface FeatureFlags {
  analyticsAdvanced: boolean;
  promotions: boolean;
  recommendationsBoost: boolean;
  loyaltyAdvanced: boolean;
  apiAccess: boolean;
  webhooks: boolean;
  inventoryModule: boolean;
  pinnedProducts: boolean;
  prioritySupport: boolean;
}

export interface LimitCaps {
  products: number;
  promotionsActive: number;
  pinnedPerSupplier: number;
  favoriteLists: number;
  users: number;
  apiRateRps: number;
  storageGB: number;
}

export interface Entitlements {
  features: FeatureFlags;
  limits: LimitCaps;
}

export interface SubscriptionPlan {
  id: string;
  code: PlanCode;
  name: string;
  description?: string;
  isActive: boolean;
  entitlements: Entitlements;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgSubscription {
  id: string;
  orgId: string;
  orgType: OrgType;
  planId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  startsAt: Date;
  endsAt?: Date;
  trialEndsAt?: Date;
  overrides?: Partial<Entitlements>;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Error types for entitlement violations
 */
export interface FeatureLockedError {
  error: 'FEATURE_LOCKED';
  feature: keyof FeatureFlags;
  requiredTier: PlanCode;
  currentTier: PlanCode;
}

export interface LimitExceededError {
  error: 'LIMIT_EXCEEDED';
  limit: keyof LimitCaps;
  current: number;
  cap: number;
  suggestedTier: PlanCode;
}

export type EntitlementError = FeatureLockedError | LimitExceededError;

/**
 * Plan comparison utilities
 */
export const PLAN_HIERARCHY: Record<PlanCode, number> = {
  BASIC: 1,
  PRO: 2,
  PREMIUM: 3,
};

export const PLAN_NAMES: Record<PlanCode, string> = {
  BASIC: 'Basic',
  PRO: 'Pro',
  PREMIUM: 'Premium',
};

