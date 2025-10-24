import { useQuery } from '@tanstack/react-query';
import { useFlag } from './useFlag';

export interface PromoSuiteFlag {
  enabled: boolean;
  loading: boolean;
  error?: Error;
}

export function usePromoSuiteFlag(): PromoSuiteFlag {
  const { on: enabled, loading, error } = useFlag('promotions_extended');

  return {
    enabled: enabled || false,
    loading,
    error: error ? new Error(error) : undefined,
  };
}

// Helper hook for conditional rendering
export function usePromoSuiteGate() {
  const { enabled, loading } = usePromoSuiteFlag();
  
  return {
    isEnabled: enabled,
    isLoading: loading,
    // Helper for conditional rendering
    Gate: ({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) => {
      if (loading) return null;
      return enabled ? <>{children}</> : <>{fallback}</>;
    },
  };
}
