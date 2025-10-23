import { useQuery } from '@tanstack/react-query';
import { ReactNode } from 'react';

/**
 * Web/React SDK for Feature Flags
 */

export interface FlagDTO {
  key: string;
  name: string;
  status: string;
  rolloutPct?: number;
  reason?: string;
}

/**
 * Hook to check a single feature flag
 */
export function useFlag(flagKey: string) {
  return useQuery<FlagDTO>({
    queryKey: ['featureFlag', flagKey],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetFeatureFlag($key: String!) {
              featureFlag(key: $key) {
                key
                name
                status
                rolloutPct
                reason
              }
            }
          `,
          variables: { key: flagKey },
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to fetch flag');
      }

      return result.data.featureFlag;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch all feature flags for current context
 */
export function useFeatureFlags() {
  return useQuery<FlagDTO[]>({
    queryKey: ['featureFlags'],
    queryFn: async () => {
      const response = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            query GetFeatureFlags {
              featureFlags {
                key
                name
                status
                rolloutPct
                reason
                dependencies
              }
            }
          `,
        }),
      });

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0]?.message || 'Failed to fetch flags');
      }

      return result.data.featureFlags;
    },
    staleTime: 2 * 60 * 1000,
    cacheTime: 5 * 60 * 1000,
  });
}

/**
 * Component to conditionally render based on feature flag
 */
export function FlagGate({
  flagKey,
  children,
  fallback,
}: {
  flagKey: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: flag, isLoading } = useFlag(flagKey);

  if (isLoading) {
    return null;
  }

  if (flag?.status === 'ON') {
    return <>{children}</>;
  }

  return <>{fallback || null}</>;
}

/**
 * HOC to wrap component with feature gate
 */
export function withFeatureGate<P extends object>(
  Component: React.ComponentType<P>,
  flagKey: string,
  fallback?: ReactNode,
) {
  return function FeatureGatedComponent(props: P) {
    return (
      <FlagGate flagKey={flagKey} fallback={fallback}>
        <Component {...props} />
      </FlagGate>
    );
  };
}

/**
 * Hook that returns whether a flag is enabled (boolean only)
 */
export function useFlagEnabled(flagKey: string): boolean {
  const { data: flag } = useFlag(flagKey);
  return flag?.status === 'ON';
}

/**
 * Hook for checking multiple flags at once
 */
export function useFlags(flagKeys: string[]): Record<string, boolean> {
  const { data: flags } = useFeatureFlags();

  const result: Record<string, boolean> = {};

  flagKeys.forEach((key) => {
    const flag = flags?.find((f) => f.key === key);
    result[key] = flag?.status === 'ON';
  });

  return result;
}

