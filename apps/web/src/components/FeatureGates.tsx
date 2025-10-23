'use client';

import { useFlag, FlagGate } from '@/hooks/useFlag';

interface PromoSuiteGateProps {
  children: React.ReactNode;
  fallbackChildren?: React.ReactNode;
}

/**
 * Component that gates PromoSuite features based on feature flags
 */
export function PromoSuiteGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="promosuite"
      fallbackChildren={fallbackChildren}
      loadingComponent={
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      }
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if PromoSuite is enabled
 */
export function usePromoSuiteFlag() {
  return useFlag('promosuite', {}, false);
}

/**
 * Component that gates Sponsored Ads features
 */
export function SponsoredAdsGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="sponsoredAds"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Sponsored Ads are enabled
 */
export function useSponsoredAdsFlag() {
  return useFlag('sponsoredAds', {}, false);
}

/**
 * Component that gates Chat features
 */
export function ChatGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="chat_enabled"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Chat is enabled
 */
export function useChatFlag() {
  return useFlag('chat_enabled', {}, true);
}

/**
 * Component that gates Real-time Orders features
 */
export function OrdersRealtimeGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="orders_realtime"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Real-time Orders are enabled
 */
export function useOrdersRealtimeFlag() {
  return useFlag('orders_realtime', {}, false);
}

/**
 * Component that gates Pinned Products features
 */
export function PinnedProductsGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="pinned_products"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Pinned Products are enabled
 */
export function usePinnedProductsFlag() {
  return useFlag('pinned_products', {}, false);
}

/**
 * Component that gates Inventory features
 */
export function InventoryGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="inventory_module"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Inventory is enabled
 */
export function useInventoryFlag() {
  return useFlag('inventory_module', {}, false);
}

/**
 * Component that gates Loyalty Program features
 */
export function LoyaltyGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="loyalty_program"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Loyalty Program is enabled
 */
export function useLoyaltyFlag() {
  return useFlag('loyalty_program', {}, false);
}

/**
 * Component that gates Recommendations features
 */
export function RecommendationsGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="recommendations"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Recommendations are enabled
 */
export function useRecommendationsFlag() {
  return useFlag('recommendations', {}, false);
}

/**
 * Component that gates Analytics features
 */
export function AnalyticsGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="analytics_dashboards"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Analytics are enabled
 */
export function useAnalyticsFlag() {
  return useFlag('analytics_dashboards', {}, false);
}

/**
 * Component that gates Catalog features
 */
export function CatalogGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="catalog"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Catalog is enabled
 */
export function useCatalogFlag() {
  return useFlag('catalog', {}, true);
}

/**
 * Component that gates Subscription features
 */
export function SubscriptionGate({ children, fallbackChildren = null }: PromoSuiteGateProps) {
  return (
    <FlagGate
      flagKey="subscriptions"
      fallbackChildren={fallbackChildren}
    >
      {children}
    </FlagGate>
  );
}

/**
 * Hook to check if Subscriptions are enabled
 */
export function useSubscriptionFlag() {
  return useFlag('subscriptions', {}, true);
}
