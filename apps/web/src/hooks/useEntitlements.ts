'use client';

import { useQuery } from '@tanstack/react-query';
import type { Entitlements, OrgType, FeatureFlags } from '@supplify/entitlements';
import { hasFeature, withinLimit, getUsagePercentage } from '@supplify/entitlements';

/**
 * Hook to fetch current organization's entitlements
 */
export function useEntitlements(orgType: OrgType) {
  return useQuery<Entitlements>({
    queryKey: ['entitlements', orgType],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetMyEntitlements($orgType: String!) {
              myEntitlements(orgType: $orgType) {
                features {
                  analyticsAdvanced
                  promotions
                  recommendationsBoost
                  loyaltyAdvanced
                  apiAccess
                  webhooks
                  inventoryModule
                  pinnedProducts
                  prioritySupport
                }
                limits {
                  products
                  promotionsActive
                  pinnedPerSupplier
                  favoriteLists
                  users
                  apiRateRps
                  storageGB
                }
              }
            }
          `,
          variables: { orgType },
        }),
      });

      const result = await response.json();
      
      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to fetch entitlements');
      }

      return result.data.myEntitlements;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to check if a specific feature is enabled
 */
export function useFeature(feature: keyof FeatureFlags, orgType: OrgType = 'SUPPLIER') {
  const { data: entitlements, isLoading } = useEntitlements(orgType);

  return {
    enabled: entitlements ? hasFeature(entitlements, feature) : false,
    isLoading,
    requiredTier: entitlements && !hasFeature(entitlements, feature)
      ? getSuggestedTier(feature)
      : undefined,
  };
}

/**
 * Hook to check if within a specific limit
 */
export function useLimit(
  limit: keyof import('@supplify/entitlements').LimitCaps,
  current: number,
  orgType: OrgType = 'SUPPLIER',
) {
  const { data: entitlements } = useEntitlements(orgType);

  if (!entitlements) {
    return {
      withinLimit: true,
      remaining: 0,
      usagePercent: 0,
      cap: 0,
    };
  }

  const cap = entitlements.limits[limit];
  const remaining = Math.max(0, cap - current);
  const usagePercent = getUsagePercentage(entitlements, limit, current);
  const isWithinLimit = withinLimit(entitlements, limit, current);

  return {
    withinLimit: isWithinLimit,
    remaining,
    usagePercent,
    cap,
    isNearLimit: usagePercent >= 80,
    isAtLimit: current >= cap,
  };
}

/**
 * Helper to get suggested tier for a feature
 */
function getSuggestedTier(feature: keyof FeatureFlags): 'BASIC' | 'PRO' | 'PREMIUM' {
  const tierMap: Record<keyof FeatureFlags, 'BASIC' | 'PRO' | 'PREMIUM'> = {
    analyticsAdvanced: 'PRO',
    promotions: 'PRO',
    recommendationsBoost: 'PRO',
    inventoryModule: 'PRO',
    loyaltyAdvanced: 'PREMIUM',
    apiAccess: 'PREMIUM',
    webhooks: 'PREMIUM',
    prioritySupport: 'PREMIUM',
    pinnedProducts: 'BASIC',
  };

  return tierMap[feature];
}

