import { Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import React, { useState, useEffect } from 'react';

export interface FlagContext {
  env: 'dev' | 'staging' | 'prod';
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

@Injectable()
export class FeatureFlagsService {
  constructor(private flagsClient: ClientProxy) {}

  /**
   * Evaluate a single feature flag
   */
  async evaluateFlag(flagKey: string, context: FlagContext): Promise<FlagEvaluationResult> {
    try {
      const result = await firstValueFrom(
        this.flagsClient.send('flags.evaluate', {
          flagKey,
          context,
        })
      );
      return result;
    } catch (error) {
      console.error(`Failed to evaluate flag ${flagKey}:`, error);
      return { on: false, reason: 'evaluation_error' };
    }
  }

  /**
   * Check if a feature flag is enabled
   */
  async isEnabled(flagKey: string, context: FlagContext): Promise<boolean> {
    const result = await this.evaluateFlag(flagKey, context);
    return result.on;
  }

  /**
   * Require a feature flag to be enabled, throw error if not
   */
  async requireFlag(flagKey: string, context: FlagContext): Promise<void> {
    const result = await this.evaluateFlag(flagKey, context);
    if (!result.on) {
      const error = new Error(`Feature "${flagKey}" is not enabled`);
      (error as any).code = 'FEATURE_FLAG_DISABLED';
      (error as any).flagKey = flagKey;
      (error as any).reason = result.reason;
      throw error;
    }
  }

  /**
   * Get all feature flags for a context
   */
  async getAllFlags(context: FlagContext): Promise<any[]> {
    try {
      const flags = await firstValueFrom(
        this.flagsClient.send('flags.get.all', {})
      );
      
      // Evaluate each flag for the context
      const evaluatedFlags = await Promise.all(
        flags.map(async (flag: any) => {
          const evaluation = await this.evaluateFlag(flag.key, context);
          return {
            ...flag,
            status: evaluation.on ? 'ON' : 'OFF',
            reason: evaluation.reason,
            rolloutBucket: evaluation.rolloutBucket,
          };
        })
      );
      
      return evaluatedFlags;
    } catch (error) {
      console.error('Failed to get all flags:', error);
      return [];
    }
  }
}

// Frontend hook for React
export function useFeatureFlags() {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFlags() {
      try {
        // This would be replaced with actual GraphQL query
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query GetFeatureFlags {
                featureFlags
              }
            `,
          }),
        });
        
        const data = await response.json();
        const flagsData = JSON.parse(data.data.featureFlags);
        
        const flagsMap: Record<string, boolean> = {};
        flagsData.forEach((flag: any) => {
          flagsMap[flag.key] = flag.status === 'ON';
        });
        
        setFlags(flagsMap);
      } catch (error) {
        console.error('Failed to load feature flags:', error);
      } finally {
        setLoading(false);
      }
    }

    loadFlags();
  }, []);

  return { flags, loading };
}

// React hook for evaluating a single flag
export function useFeatureFlag(flagKey: string, context?: FlagContext) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function evaluateFlag() {
      try {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query EvaluateFeatureFlag($flagKey: String!, $orgType: String, $orgId: String, $userId: String) {
                evaluateFeatureFlag(flagKey: $flagKey, orgType: $orgType, orgId: $orgId, userId: $userId)
              }
            `,
            variables: {
              flagKey,
              orgType: context?.orgType,
              orgId: context?.orgId,
              userId: context?.userId,
            },
          }),
        });
        
        const data = await response.json();
        const result = JSON.parse(data.data.evaluateFeatureFlag);
        setEnabled(result.on);
      } catch (error) {
        console.error(`Failed to evaluate flag ${flagKey}:`, error);
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }

    evaluateFlag();
  }, [flagKey, context?.orgType, context?.orgId, context?.userId]);

  return { enabled, loading };
}