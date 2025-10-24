import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import * as murmur from 'murmurhash';
import { RuleStatus, ForcedStatus } from '@prisma/client';

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

/**
 * Feature Flags Evaluation Engine
 * Handles dependency resolution, rollouts, targeting, and caching
 */
@Injectable()
export class FlagsEngineService {
  private readonly logger = new Logger(FlagsEngineService.name);
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get cache key for compiled flag config
   */
  private getFlagCacheKey(env: string, flagKey: string): string {
    return `flag:${env}:${flagKey}`;
  }

  /**
   * Get cache key for evaluation result
   */
  private getEvalCacheKey(env: string, flagKey: string, orgType?: string, orgId?: string, userId?: string): string {
    return `flag_eval_cache:${env}:${flagKey}:${orgType || 'any'}:${orgId || 'any'}:${userId || 'any'}`;
  }

  /**
   * Invalidate all caches for a flag
   */
  async invalidateFlagCache(flagKey: string, env?: string): Promise<void> {
    const environments = env ? [env] : ['dev', 'staging', 'prod'];

    const keys = [];
    for (const e of environments) {
      keys.push(this.getFlagCacheKey(e, flagKey));
      // Also clear eval caches
      const evalPattern = `flag_eval_cache:${e}:${flagKey}:*`;
      const evalKeys = await this.redis.keys(evalPattern);
      keys.push(...evalKeys);
    }

    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(`Invalidated ${keys.length} cache keys for flag ${flagKey}`);
    }
  }

  /**
   * Evaluate a feature flag for a given context
   */
  async evaluateFlag(flagKey: string, context: FlagContext): Promise<FlagEvaluationResult> {
    // Check eval cache first (short TTL)
    const evalCacheKey = this.getEvalCacheKey(context.env, flagKey, context.orgType, context.orgId, context.userId);
    const cached = await this.redis.get(evalCacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Evaluate
    const result = await this.evaluateFlagInternal(flagKey, context);

    // Cache for 60 seconds
    await this.redis.setex(evalCacheKey, 60, JSON.stringify(result));

    // Log evaluation (for analytics/telemetry)
    await this.logEvaluation(flagKey, context, result);

    return result;
  }

  /**
   * Internal evaluation logic
   */
  private async evaluateFlagInternal(
    flagKey: string,
    context: FlagContext,
  ): Promise<FlagEvaluationResult> {
    // Get flag definition
    const flag = await this.getFlag(flagKey);

    if (!flag) {
      // Flag doesn't exist - default to OFF
      return { on: false, reason: 'flag_not_found' };
    }

    // Step 1: Check dependencies
    if (flag.dependencies && flag.dependencies.length > 0) {
      for (const depKey of flag.dependencies) {
        const depResult = await this.evaluateFlag(depKey, context);
        if (!depResult.on) {
          return {
            on: false,
            reason: `dependency_off:${depKey}`,
          };
        }
      }
    }

    // Step 2: Check overrides (most specific first)
    const override = await this.findOverride(flag.id, context);
    if (override) {
      return {
        on: override.forcedStatus === ForcedStatus.FORCE_ON,
        reason: `override:${override.id}`,
      };
    }

    // Step 3: Apply rules
    const rules = await this.getRulesForFlag(flag.id, context);

    if (rules.length === 0) {
      // No rules - use default
      return {
        on: flag.enabledByDefault,
        reason: 'default',
      };
    }

    // Sort by priority (highest first)
    const sortedRules = rules.sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      // Check if rule matches context
      if (!this.ruleMatches(rule, context)) {
        continue;
      }

      // Apply rule
      if (rule.status === RuleStatus.ON) {
        return {
          on: true,
          reason: 'rule_on',
          ruleId: rule.id,
        };
      }

      if (rule.status === RuleStatus.OFF) {
        return {
          on: false,
          reason: 'rule_off',
          ruleId: rule.id,
        };
      }

      if (rule.status === RuleStatus.ROLLOUT) {
        // Deterministic hashing for rollout - prefer userId, fallback to orgId
        const identifier = context.userId || context.orgId || 'anonymous';
        const bucket = this.getRolloutBucket(identifier);
        const isInRollout = bucket < rule.rolloutPct;

        return {
          on: isInRollout,
          reason: isInRollout ? 'rollout_hit' : 'rollout_miss',
          ruleId: rule.id,
          rolloutBucket: bucket,
        };
      }
    }

    // No matching rule - use default
    return {
      on: flag.enabledByDefault,
      reason: 'default_no_matching_rule',
    };
  }

  /**
   * Get flag from cache or DB
   */
  private async getFlag(flagKey: string) {
    return this.prisma.featureFlag.findUnique({
      where: { key: flagKey },
    });
  }

  /**
   * Get rules for a flag in an environment
   */
  private async getRulesForFlag(flagId: string, context: FlagContext) {
    return this.prisma.flagRule.findMany({
      where: {
        flagId,
        environment: context.env,
      },
      orderBy: {
        priority: 'desc',
      },
    });
  }

  /**
   * Find most specific override for context
   */
  private async findOverride(flagId: string, context: FlagContext) {
    // Try in order of specificity
    const conditions = [
      // User-level (future)
      context.userId && {
        flagId,
        environment: context.env,
        userId: context.userId,
      },
      // Org-level
      context.orgId && {
        flagId,
        environment: context.env,
        orgId: context.orgId,
      },
      // OrgType-level
      context.orgType && {
        flagId,
        environment: context.env,
        orgType: context.orgType,
        orgId: null,
      },
    ].filter(Boolean);

    for (const where of conditions) {
      const override = await this.prisma.flagOverride.findFirst({
        where: where as any,
      });

      if (override) return override;
    }

    return null;
  }

  /**
   * Check if rule matches the context
   */
  private ruleMatches(rule: any, context: FlagContext): boolean {
    // Check orgType
    if (rule.targetOrgType && context.orgType !== rule.targetOrgType) {
      return false;
    }

    // Check orgId allowlist
    if (rule.targetOrgIds && rule.targetOrgIds.length > 0) {
      if (!context.orgId || !rule.targetOrgIds.includes(context.orgId)) {
        return false;
      }
    }

    // Future: Check conditions JSON
    // ...

    return true;
  }

  /**
   * Calculate rollout bucket (0-99) for deterministic rollout
   * Uses MurmurHash for consistent bucketing
   */
  private getRolloutBucket(identifier: string): number {
    const hash = murmur.v3(identifier);
    return hash % 100;
  }

  /**
   * Batch evaluate multiple flags
   */
  async evaluateFlags(flagKeys: string[], context: FlagContext): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    await Promise.all(
      flagKeys.map(async (key) => {
        const result = await this.evaluateFlag(key, context);
        results[key] = result.on;
      }),
    );

    return results;
  }

  /**
   * Get all flags with effective status for context
   */
  async getAllFlags(context: FlagContext) {
    const flags = await this.prisma.featureFlag.findMany({
      orderBy: { key: 'asc' },
    });

    const results = await Promise.all(
      flags.map(async (flag) => {
        const evaluation = await this.evaluateFlag(flag.key, context);

        return {
          key: flag.key,
          name: flag.name,
          description: flag.description,
          status: evaluation.on ? 'ON' : 'OFF',
          rolloutPct: evaluation.rolloutBucket,
          reason: evaluation.reason,
          dependencies: flag.dependencies,
        };
      }),
    );

    return results;
  }

  /**
   * Log evaluation for analytics (sampled for performance)
   */
  private async logEvaluation(
    flagKey: string,
    context: FlagContext,
    result: FlagEvaluationResult,
  ): Promise<void> {
    // Sample evaluations (10% for analytics)
    if (Math.random() > 0.1) return;

    try {
      await this.prisma.flagEvaluation.create({
        data: {
          flagKey,
          environment: context.env,
          result: result.on,
          orgType: context.orgType,
          orgId: context.orgId,
          userId: context.userId,
          ruleId: result.ruleId,
          reason: result.reason,
        },
      });
    } catch (error) {
      // Don't fail evaluation if logging fails
      this.logger.warn(`Failed to log evaluation for ${flagKey}:`, error);
    }
  }

  /**
   * Check flag and throw if OFF
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
}

