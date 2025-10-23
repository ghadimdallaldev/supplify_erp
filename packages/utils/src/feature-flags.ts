import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { TenantAwareCacheService } from '@supplify/utils';
import { TenantContext } from '@supplify/utils';

export interface FeatureFlagEvaluation {
  flagKey: string;
  enabled: boolean;
  reason: 'default' | 'rule' | 'override' | 'rollout';
  ruleId?: string;
  overrideId?: string;
  rolloutPercentage?: number;
  evaluatedAt: string;
}

@Injectable()
export class FeatureFlagService {
  constructor(private cache: TenantAwareCacheService) {}

  /**
   * Evaluate feature flag with full context
   */
  async evaluateFlag(
    flagKey: string,
    context: {
      env: string;
      userId?: string;
      orgType?: string;
      clientId?: string;
    }
  ): Promise<FeatureFlagEvaluation> {
    const cacheKey = `flags:${flagKey}:${context.env}:${context.clientId}:${context.userId}`;
    
    // Check cache first
    const cached = await this.cache.get<FeatureFlagEvaluation>(cacheKey);
    if (cached) {
      return cached;
    }

    // Load flag definition
    const flag = await this.getFlagDefinition(flagKey);
    if (!flag) {
      throw new Error(`Feature flag '${flagKey}' not found`);
    }

    // Evaluate in order: Override → Rule → Default
    let evaluation: FeatureFlagEvaluation = {
      flagKey,
      enabled: flag.enabledByDefault,
      reason: 'default',
      evaluatedAt: new Date().toISOString(),
    };

    // Check for user-specific override
    if (context.userId) {
      const userOverride = await this.getUserOverride(flagKey, context.userId, context.env);
      if (userOverride) {
        evaluation = {
          flagKey,
          enabled: userOverride.forcedStatus === 'FORCE_ON',
          reason: 'override',
          overrideId: userOverride.id,
          evaluatedAt: new Date().toISOString(),
        };
      }
    }

    // Check for org-specific override
    if (!evaluation.overrideId && context.clientId) {
      const orgOverride = await this.getOrgOverride(flagKey, context.clientId, context.env);
      if (orgOverride) {
        evaluation = {
          flagKey,
          enabled: orgOverride.forcedStatus === 'FORCE_ON',
          reason: 'override',
          overrideId: orgOverride.id,
          evaluatedAt: new Date().toISOString(),
        };
      }
    }

    // Check for org-type override
    if (!evaluation.overrideId && context.orgType) {
      const orgTypeOverride = await this.getOrgTypeOverride(flagKey, context.orgType, context.env);
      if (orgTypeOverride) {
        evaluation = {
          flagKey,
          enabled: orgTypeOverride.forcedStatus === 'FORCE_ON',
          reason: 'override',
          overrideId: orgTypeOverride.id,
          evaluatedAt: new Date().toISOString(),
        };
      }
    }

    // Check for rules (if no override)
    if (!evaluation.overrideId) {
      const rule = await this.getApplicableRule(flagKey, context);
      if (rule) {
        if (rule.status === 'ON') {
          evaluation = {
            flagKey,
            enabled: true,
            reason: 'rule',
            ruleId: rule.id,
            evaluatedAt: new Date().toISOString(),
          };
        } else if (rule.status === 'OFF') {
          evaluation = {
            flagKey,
            enabled: false,
            reason: 'rule',
            ruleId: rule.id,
            evaluatedAt: new Date().toISOString(),
          };
        } else if (rule.status === 'ROLLOUT') {
          const isInRollout = this.isInRollout(context.userId || context.clientId, rule.rolloutPct);
          evaluation = {
            flagKey,
            enabled: isInRollout,
            reason: 'rollout',
            ruleId: rule.id,
            rolloutPercentage: rule.rolloutPct,
            evaluatedAt: new Date().toISOString(),
          };
        }
      }
    }

    // Cache the result
    await this.cache.set(cacheKey, evaluation, 300); // 5 minute TTL

    return evaluation;
  }

  /**
   * Check if a flag is enabled (simple boolean check)
   */
  async isFlagEnabled(
    flagKey: string,
    context: {
      env: string;
      userId?: string;
      orgType?: string;
      clientId?: string;
    }
  ): Promise<boolean> {
    const evaluation = await this.evaluateFlag(flagKey, context);
    return evaluation.enabled;
  }

  /**
   * Require a flag to be enabled (throws if disabled)
   */
  async requireFlag(
    flagKey: string,
    context: {
      env: string;
      userId?: string;
      orgType?: string;
      clientId?: string;
    }
  ): Promise<void> {
    const enabled = await this.isFlagEnabled(flagKey, context);
    if (!enabled) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: `Feature '${flagKey}' is not enabled`,
        flagKey,
        context,
      });
    }
  }

  /**
   * Get all flags for a context
   */
  async getAllFlags(context: {
    env: string;
    userId?: string;
    orgType?: string;
    clientId?: string;
  }): Promise<Record<string, boolean>> {
    const flags = await this.getAllFlagDefinitions();
    const result: Record<string, boolean> = {};

    for (const flag of flags) {
      result[flag.key] = await this.isFlagEnabled(flag.key, context);
    }

    return result;
  }

  /**
   * Invalidate flag cache for a specific flag or all flags
   */
  async invalidateFlagCache(flagKey?: string, context?: {
    env: string;
    userId?: string;
    clientId?: string;
  }): Promise<void> {
    if (flagKey) {
      // Invalidate specific flag
      const pattern = context 
        ? `flags:${flagKey}:${context.env}:${context.clientId}:${context.userId}`
        : `flags:${flagKey}:*`;
      
      await this.cache.delPattern(pattern);
    } else {
      // Invalidate all flags
      await this.cache.delPattern('flags:*');
    }
  }

  /**
   * Publish flag change event
   */
  async publishFlagChange(flagKey: string, oldValue: any, newValue: any): Promise<void> {
    // This would publish to RabbitMQ in a real implementation
    console.log(`Flag changed: ${flagKey}`, { oldValue, newValue });
    
    // Invalidate cache
    await this.invalidateFlagCache(flagKey);
  }

  // Private helper methods
  private async getFlagDefinition(flagKey: string): Promise<any> {
    // In real implementation, this would query the database
    const mockFlags = {
      catalog: { key: 'catalog', enabledByDefault: true },
      orders_realtime: { key: 'orders_realtime', enabledByDefault: false },
      chat_enabled: { key: 'chat_enabled', enabledByDefault: false },
      pinned_products: { key: 'pinned_products', enabledByDefault: false },
      inventory_module: { key: 'inventory_module', enabledByDefault: false },
      promotions_basic: { key: 'promotions_basic', enabledByDefault: false },
      promosuite: { key: 'promosuite', enabledByDefault: false },
      sponsoredAds: { key: 'sponsoredAds', enabledByDefault: false },
      loyalty_program: { key: 'loyalty_program', enabledByDefault: false },
      recommendations: { key: 'recommendations', enabledByDefault: false },
      subscriptions: { key: 'subscriptions', enabledByDefault: false },
      analytics_dashboards: { key: 'analytics_dashboards', enabledByDefault: false },
      feature_flags_admin: { key: 'feature_flags_admin', enabledByDefault: true },
    };

    return mockFlags[flagKey];
  }

  private async getAllFlagDefinitions(): Promise<any[]> {
    return Object.values({
      catalog: { key: 'catalog', enabledByDefault: true },
      orders_realtime: { key: 'orders_realtime', enabledByDefault: false },
      chat_enabled: { key: 'chat_enabled', enabledByDefault: false },
      pinned_products: { key: 'pinned_products', enabledByDefault: false },
      inventory_module: { key: 'inventory_module', enabledByDefault: false },
      promotions_basic: { key: 'promotions_basic', enabledByDefault: false },
      promosuite: { key: 'promosuite', enabledByDefault: false },
      sponsoredAds: { key: 'sponsoredAds', enabledByDefault: false },
      loyalty_program: { key: 'loyalty_program', enabledByDefault: false },
      recommendations: { key: 'recommendations', enabledByDefault: false },
      subscriptions: { key: 'subscriptions', enabledByDefault: false },
      analytics_dashboards: { key: 'analytics_dashboards', enabledByDefault: false },
      feature_flags_admin: { key: 'feature_flags_admin', enabledByDefault: true },
    });
  }

  private async getUserOverride(flagKey: string, userId: string, env: string): Promise<any> {
    // In real implementation, this would query the database
    return null;
  }

  private async getOrgOverride(flagKey: string, clientId: string, env: string): Promise<any> {
    // In real implementation, this would query the database
    return null;
  }

  private async getOrgTypeOverride(flagKey: string, orgType: string, env: string): Promise<any> {
    // In real implementation, this would query the database
    return null;
  }

  private async getApplicableRule(flagKey: string, context: any): Promise<any> {
    // In real implementation, this would query the database
    return null;
  }

  private isInRollout(identifier: string, percentage: number): boolean {
    // Deterministic hash-based rollout
    const hash = this.hashString(identifier);
    return (hash % 100) < percentage;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Guard decorator for feature flags
export function RequireFlag(flagKey: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const context = this.getTenantContext?.();
      if (!context) {
        throw new ForbiddenException('Tenant context required');
      }

      const flagService = this.getFeatureFlagService?.();
      if (!flagService) {
        throw new ForbiddenException('Feature flag service not available');
      }

      await flagService.requireFlag(flagKey, {
        env: process.env.NODE_ENV || 'development',
        userId: context.userId,
        orgType: context.orgType,
        clientId: context.clientId,
      });

      return originalMethod.apply(this, args);
    };
  };
}

// GraphQL guard for feature flags
export class FeatureFlagGuard implements CanActivate {
  constructor(private flagService: FeatureFlagService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const request = gqlContext.getContext().req;
    const tenant = request.tenant as TenantContext;

    if (!tenant) {
      throw new ForbiddenException('Tenant context required');
    }

    // Extract flag key from metadata or decorator
    const flagKey = this.getFlagKeyFromContext(context);
    if (!flagKey) {
      return true; // No flag requirement
    }

    return this.flagService.isFlagEnabled(flagKey, {
      env: process.env.NODE_ENV || 'development',
      userId: tenant.userId,
      orgType: tenant.orgType,
      clientId: tenant.clientId,
    });
  }

  private getFlagKeyFromContext(context: ExecutionContext): string | null {
    // This would extract the flag key from metadata in a real implementation
    return null;
  }
}
