import {
  mergeEntitlements,
  hasFeature,
  withinLimit,
  getRemainingCapacity,
  getUsagePercentage,
  comparePlans,
  planIncludes,
  getSuggestedTierForFeature,
  getSuggestedTierForLimit,
  formatLimitName,
  formatFeatureName,
} from './utils';
import { validateEntitlements, validateOverrides } from './validators.ts';
import { Entitlements } from './types';

const baseEntitlements: Entitlements = {
  features: {
    analyticsAdvanced: false,
    promotions: true,
    recommendationsBoost: false,
    loyaltyAdvanced: false,
    apiAccess: false,
    webhooks: false,
    inventoryModule: true,
    pinnedProducts: true,
    prioritySupport: false,
  },
  limits: {
    products: 100,
    promotionsActive: 5,
    pinnedPerSupplier: 10,
    favoriteLists: 3,
    users: 5,
    apiRateRps: 10,
    storageGB: 5,
  },
};

describe('entitlements validators', () => {
  it('validates a complete entitlements object', () => {
    const result = validateEntitlements(baseEntitlements);
    expect(result.features.promotions).toBe(true);
    expect(result.limits.products).toBe(100);
  });

  it('rejects invalid plan codes in overrides', () => {
    expect(() =>
      validateOverrides({
        limits: { products: -1 },
      }),
    ).toThrow();
  });

  it('accepts partial overrides', () => {
    const result = validateOverrides({
      features: { apiAccess: true },
    });
    expect(result.features?.apiAccess).toBe(true);
  });
});

describe('entitlements utils', () => {
  it('merges overrides into base entitlements', () => {
    const merged = mergeEntitlements(baseEntitlements, {
      features: { apiAccess: true },
      limits: { products: 200 },
    } as Partial<Entitlements>);

    expect(merged.features.apiAccess).toBe(true);
    expect(merged.features.promotions).toBe(true);
    expect(merged.limits.products).toBe(200);
  });

  it('checks feature flags and limits', () => {
    expect(hasFeature(baseEntitlements, 'promotions')).toBe(true);
    expect(hasFeature(baseEntitlements, 'apiAccess')).toBe(false);
    expect(withinLimit(baseEntitlements, 'products', 50)).toBe(true);
    expect(withinLimit(baseEntitlements, 'products', 100)).toBe(false);
  });

  it('calculates remaining capacity and usage percentage', () => {
    expect(getRemainingCapacity(baseEntitlements, 'products', 80)).toBe(20);
    expect(getUsagePercentage(baseEntitlements, 'products', 50)).toBe(50);
    expect(getUsagePercentage(baseEntitlements, 'products', 200)).toBe(100);
  });

  it('compares plan tiers', () => {
    expect(comparePlans('BASIC', 'PRO')).toBeLessThan(0);
    expect(planIncludes('PREMIUM', 'PRO')).toBe(true);
    expect(getSuggestedTierForFeature('apiAccess')).toBe('PREMIUM');
    expect(getSuggestedTierForLimit('BASIC')).toBe('PRO');
  });

  it('formats display names', () => {
    expect(formatLimitName('products')).toBe('Active Products');
    expect(formatFeatureName('inventoryModule')).toBe('Inventory Management');
  });
});
