'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/app/auth-provider';

interface FeatureFlagContext {
  env: string;
  userId?: string;
  orgType?: string;
  clientId?: string;
}

interface FeatureFlagEvaluation {
  flagKey: string;
  enabled: boolean;
  reason: 'default' | 'rule' | 'override' | 'rollout';
  ruleId?: string;
  overrideId?: string;
  rolloutPercentage?: number;
  evaluatedAt: string;
}

interface FeatureFlagsState {
  flags: Record<string, boolean>;
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

// Feature flag cache
const flagCache = new Map<string, { value: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useFeatureFlags() {
  const { user } = useAuthContext();
  const [state, setState] = useState<FeatureFlagsState>({
    flags: {},
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const getContext = useCallback((): FeatureFlagContext => {
    return {
      env: process.env.NODE_ENV || 'development',
      userId: user?.id,
      orgType: user?.role?.toUpperCase(),
      clientId: user?.orgId,
    };
  }, [user]);

  const fetchFlags = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));

      const context = getContext();
      const cacheKey = `flags:${JSON.stringify(context)}`;

      // Check cache first
      const cached = flagCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setState(prev => ({
          ...prev,
          flags: { [cacheKey]: cached.value },
          loading: false,
          lastUpdated: new Date(cached.timestamp).toISOString(),
        }));
        return;
      }

      // Fetch from server
      const response = await fetch('/api/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feature flags: ${response.statusText}`);
      }

      const flags = await response.json();

      // Cache the result
      flagCache.set(cacheKey, {
        value: flags,
        timestamp: Date.now(),
      });

      setState({
        flags,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Error fetching feature flags:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [getContext]);

  const invalidateCache = useCallback(() => {
    flagCache.clear();
    fetchFlags();
  }, [fetchFlags]);

  useEffect(() => {
    if (user) {
      fetchFlags();
    }
  }, [user, fetchFlags]);

  return {
    ...state,
    refetch: fetchFlags,
    invalidateCache,
  };
}

export function useFeatureFlag(flagKey: string) {
  const { flags, loading, error } = useFeatureFlags();
  
  return {
    enabled: flags[flagKey] || false,
    loading,
    error,
  };
}

// Component for conditional rendering based on feature flags
interface FlagGateProps {
  flag: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loading?: React.ReactNode;
}

export function FlagGate({ flag, children, fallback = null, loading = null }: FlagGateProps) {
  const { enabled, loading: isLoading } = useFeatureFlag(flag);

  if (isLoading) {
    return <>{loading}</>;
  }

  if (!enabled) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

// Hook for feature flag evaluation with detailed info
export function useFeatureFlagEvaluation(flagKey: string) {
  const { user } = useAuthContext();
  const [evaluation, setEvaluation] = useState<FeatureFlagEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvaluation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const context = {
        env: process.env.NODE_ENV || 'development',
        userId: user?.id,
        orgType: user?.role?.toUpperCase(),
        clientId: user?.orgId,
      };

      const response = await fetch('/api/feature-flags/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ flagKey, context }),
      });

      if (!response.ok) {
        throw new Error(`Failed to evaluate feature flag: ${response.statusText}`);
      }

      const result = await response.json();
      setEvaluation(result);

    } catch (error) {
      console.error('Error evaluating feature flag:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [flagKey, user]);

  useEffect(() => {
    if (user) {
      fetchEvaluation();
    }
  }, [user, fetchEvaluation]);

  return {
    evaluation,
    loading,
    error,
    refetch: fetchEvaluation,
  };
}

// Hook for admin feature flag management
export function useFeatureFlagAdmin() {
  const [flags, setFlags] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [flagsRes, rulesRes, overridesRes] = await Promise.all([
        fetch('/api/admin/feature-flags?type=flags'),
        fetch('/api/admin/feature-flags?type=rules'),
        fetch('/api/admin/feature-flags?type=overrides'),
      ]);

      if (!flagsRes.ok || !rulesRes.ok || !overridesRes.ok) {
        throw new Error('Failed to fetch feature flag data');
      }

      const [flagsData, rulesData, overridesData] = await Promise.all([
        flagsRes.json(),
        rulesRes.json(),
        overridesRes.json(),
      ]);

      setFlags(flagsData);
      setRules(rulesData);
      setOverrides(overridesData);

    } catch (error) {
      console.error('Error fetching feature flag admin data:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(async (ruleData: any) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_rule',
          data: ruleData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create rule');
      }

      const result = await response.json();
      setRules(prev => [...prev, result]);
      return result;

    } catch (error) {
      console.error('Error creating rule:', error);
      throw error;
    }
  }, []);

  const updateRule = useCallback(async (ruleId: string, ruleData: any) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_rule',
          data: { id: ruleId, ...ruleData },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update rule');
      }

      const result = await response.json();
      setRules(prev => prev.map(rule => rule.id === ruleId ? result : rule));
      return result;

    } catch (error) {
      console.error('Error updating rule:', error);
      throw error;
    }
  }, []);

  const deleteRule = useCallback(async (ruleId: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete_rule',
          data: { id: ruleId },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete rule');
      }

      setRules(prev => prev.filter(rule => rule.id !== ruleId));

    } catch (error) {
      console.error('Error deleting rule:', error);
      throw error;
    }
  }, []);

  const createOverride = useCallback(async (overrideData: any) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_override',
          data: overrideData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create override');
      }

      const result = await response.json();
      setOverrides(prev => [...prev, result]);
      return result;

    } catch (error) {
      console.error('Error creating override:', error);
      throw error;
    }
  }, []);

  const deleteOverride = useCallback(async (overrideId: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete_override',
          data: { id: overrideId },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete override');
      }

      setOverrides(prev => prev.filter(override => override.id !== overrideId));

    } catch (error) {
      console.error('Error deleting override:', error);
      throw error;
    }
  }, []);

  const invalidateCache = useCallback(async (flagKey?: string) => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'invalidate_cache',
          data: { flagKey },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to invalidate cache');
      }

    } catch (error) {
      console.error('Error invalidating cache:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    flags,
    rules,
    overrides,
    loading,
    error,
    refetch: fetchData,
    createRule,
    updateRule,
    deleteRule,
    createOverride,
    deleteOverride,
    invalidateCache,
  };
}

// Utility function to check if a feature is enabled
export function isFeatureEnabled(flagKey: string, flags: Record<string, boolean>): boolean {
  return flags[flagKey] || false;
}

// Utility function to get feature flag status text
export function getFeatureFlagStatus(enabled: boolean, reason?: string): string {
  if (enabled) {
    return reason === 'rollout' ? 'Rollout' : 'Enabled';
  }
  return 'Disabled';
}

// Utility function to get feature flag status color
export function getFeatureFlagStatusColor(enabled: boolean, reason?: string): string {
  if (enabled) {
    return reason === 'rollout' ? 'text-yellow-600' : 'text-green-600';
  }
  return 'text-red-600';
}
