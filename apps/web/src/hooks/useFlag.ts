import { useState, useEffect, ReactNode } from 'react';

export interface FlagContext {
  env?: 'dev' | 'staging' | 'prod';
  orgType?: 'SUPPLIER' | 'RESTAURANT';
  orgId?: string;
  userId?: string;
}

export interface FlagEvaluationResult {
  on: boolean;
  reason?: string;
  ruleId?: string;
  rolloutBucket?: number;
}

/**
 * React hook for evaluating feature flags
 */
export function useFlag(
  flagKey: string, 
  context: FlagContext = {},
  fallback: boolean = false
): { on: boolean; loading: boolean; error?: string } {
  const [result, setResult] = useState({ on: fallback, loading: true, error: undefined });
  
  useEffect(() => {
    const evaluateFlag = async () => {
      try {
        setResult(prev => ({ ...prev, loading: true, error: undefined }));
        
        const params = new URLSearchParams({
          type: 'evaluate',
          flagKey,
          environment: context.env || 'dev',
        });
        
        if (context.orgType) params.append('orgType', context.orgType);
        if (context.orgId) params.append('orgId', context.orgId);
        if (context.userId) params.append('userId', context.userId);
        
        const response = await fetch(`/api/admin/feature-flags?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Failed to evaluate flag: ${response.statusText}`);
        }
        
        const evaluation: FlagEvaluationResult = await response.json();
        
        setResult({
          on: evaluation.on,
          loading: false,
          error: undefined,
        });
      } catch (error) {
        console.error(`Error evaluating flag ${flagKey}:`, error);
        setResult({
          on: fallback,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
    
    evaluateFlag();
  }, [flagKey, context.env, context.orgType, context.orgId, context.userId, fallback]);
  
  return result;
}

/**
 * Component that conditionally renders children based on feature flag
 */
export interface FlagGateProps {
  flagKey: string;
  context?: FlagContext;
  fallback?: boolean;
  children: ReactNode;
  fallbackChildren?: ReactNode;
  loadingComponent?: ReactNode;
}

export function FlagGate({
  flagKey,
  context = {},
  fallback = false,
  children,
  fallbackChildren = null,
  loadingComponent = null,
}: FlagGateProps) {
  const { on, loading, error } = useFlag(flagKey, context, fallback);
  
  if (loading && loadingComponent) {
    return <>{loadingComponent}</>;
  }
  
  if (error) {
    console.warn(`FlagGate error for ${flagKey}:`, error);
    return fallback ? <>{children}</> : <>{fallbackChildren}</>;
  }
  
  return on ? <>{children}</> : <>{fallbackChildren}</>;
}

/**
 * Hook for evaluating multiple flags at once
 */
export function useFlags(
  flagKeys: string[],
  context: FlagContext = {},
  fallbacks: Record<string, boolean> = {}
): { flags: Record<string, boolean>; loading: boolean; errors: Record<string, string> } {
  const [result, setResult] = useState({
    flags: {} as Record<string, boolean>,
    loading: true,
    errors: {} as Record<string, string>,
  });
  
  useEffect(() => {
    const evaluateFlags = async () => {
      try {
        setResult(prev => ({ ...prev, loading: true, errors: {} }));
        
        const evaluations = await Promise.allSettled(
          flagKeys.map(async (flagKey) => {
            const params = new URLSearchParams({
              type: 'evaluate',
              flagKey,
              environment: context.env || 'dev',
            });
            
            if (context.orgType) params.append('orgType', context.orgType);
            if (context.orgId) params.append('orgId', context.orgId);
            if (context.userId) params.append('userId', context.userId);
            
            const response = await fetch(`/api/admin/feature-flags?${params.toString()}`);
            
            if (!response.ok) {
              throw new Error(`Failed to evaluate flag ${flagKey}: ${response.statusText}`);
            }
            
            const evaluation: FlagEvaluationResult = await response.json();
            return { flagKey, on: evaluation.on };
          })
        );
        
        const flags: Record<string, boolean> = {};
        const errors: Record<string, string> = {};
        
        evaluations.forEach((result, index) => {
          const flagKey = flagKeys[index];
          
          if (result.status === 'fulfilled') {
            flags[flagKey] = result.value.on;
          } else {
            flags[flagKey] = fallbacks[flagKey] || false;
            errors[flagKey] = result.reason?.message || 'Unknown error';
          }
        });
        
        setResult({ flags, loading: false, errors });
      } catch (error) {
        console.error('Error evaluating flags:', error);
        
        const flags: Record<string, boolean> = {};
        flagKeys.forEach(flagKey => {
          flags[flagKey] = fallbacks[flagKey] || false;
        });
        
        setResult({
          flags,
          loading: false,
          errors: { general: error instanceof Error ? error.message : 'Unknown error' },
        });
      }
    };
    
    evaluateFlags();
  }, [flagKeys.join(','), context.env, context.orgType, context.orgId, context.userId]);
  
  return result;
}