import { Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

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
 * Server-side feature flag utilities
 */
@Injectable()
export class FlagsServerService {
  private readonly logger = new Logger(FlagsServerService.name);

  constructor(
    @Inject('FLAGS_SERVICE') private flagsClient: ClientProxy,
  ) {}

  /**
   * Check if a feature flag is enabled
   */
  async isFlagOn(flagKey: string, context: FlagContext): Promise<boolean> {
    try {
      const result = await this.flagsClient
        .send('flags.evaluate', { flagKey, context })
        .toPromise();
      
      return result?.on || false;
    } catch (error) {
      this.logger.warn(`Failed to evaluate flag ${flagKey}:`, error);
      return false;
    }
  }

  /**
   * Require a feature flag to be enabled, throw error if not
   */
  async requireFlag(flagKey: string, context: FlagContext): Promise<void> {
    const isOn = await this.isFlagOn(flagKey, context);
    
    if (!isOn) {
      const error = new Error(`Feature "${flagKey}" is not enabled`);
      (error as any).code = 'FEATURE_FLAG_DISABLED';
      (error as any).flagKey = flagKey;
      throw error;
    }
  }

  /**
   * Evaluate multiple flags at once
   */
  async evaluateFlags(
    flagKeys: string[],
    context: FlagContext
  ): Promise<Record<string, boolean>> {
    try {
      const results = await Promise.allSettled(
        flagKeys.map(async (flagKey) => {
          const result = await this.isFlagOn(flagKey, context);
          return { flagKey, on: result };
        })
      );

      const flags: Record<string, boolean> = {};
      
      results.forEach((result, index) => {
        const flagKey = flagKeys[index];
        
        if (result.status === 'fulfilled') {
          flags[flagKey] = result.value.on;
        } else {
          flags[flagKey] = false;
          this.logger.warn(`Failed to evaluate flag ${flagKey}:`, result.reason);
        }
      });

      return flags;
    } catch (error) {
      this.logger.error('Error evaluating multiple flags:', error);
      
      // Return all flags as false on error
      const flags: Record<string, boolean> = {};
      flagKeys.forEach(flagKey => {
        flags[flagKey] = false;
      });
      
      return flags;
    }
  }

  /**
   * Get detailed evaluation result for a flag
   */
  async evaluateFlag(
    flagKey: string,
    context: FlagContext
  ): Promise<FlagEvaluationResult> {
    try {
      const result = await this.flagsClient
        .send('flags.evaluate', { flagKey, context })
        .toPromise();
      
      return result || { on: false, reason: 'evaluation_failed' };
    } catch (error) {
      this.logger.warn(`Failed to evaluate flag ${flagKey}:`, error);
      return { on: false, reason: 'evaluation_error' };
    }
  }

  /**
   * Invalidate flag cache
   */
  async invalidateFlagCache(flagKey: string, env?: string): Promise<void> {
    try {
      await this.flagsClient
        .send('flags.invalidate_cache', { flagKey, env })
        .toPromise();
    } catch (error) {
      this.logger.warn(`Failed to invalidate cache for flag ${flagKey}:`, error);
    }
  }
}

/**
 * Decorator for requiring a feature flag
 */
export function RequireFlag(flagKey: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const flagsService = this.flagsService || this.flagsServerService;
      
      if (!flagsService) {
        throw new Error('FlagsService not available');
      }

      // Extract context from request (this is service-specific)
      const context = this.extractFlagContext?.(args[0]) || {
        env: 'dev',
        orgType: undefined,
        orgId: undefined,
        userId: undefined,
      };

      await flagsService.requireFlag(flagKey, context);
      
      return method.apply(this, args);
    };

    return descriptor;
  };
}

/**
 * Utility function for extracting flag context from request
 */
export function extractFlagContextFromRequest(req: any): FlagContext {
  const headers = req.headers || {};
  
  return {
    env: (headers['x-environment'] as any) || 'dev',
    orgType: headers['x-org-type'] as any,
    orgId: headers['x-org-id'],
    userId: headers['x-user-id'],
  };
}

/**
 * Utility function for extracting flag context from GraphQL context
 */
export function extractFlagContextFromGraphQL(context: any): FlagContext {
  const user = context.user || {};
  const headers = context.req?.headers || {};
  
  return {
    env: (headers['x-environment'] as any) || 'dev',
    orgType: user.orgType || headers['x-org-type'],
    orgId: user.orgId || headers['x-org-id'],
    userId: user.id || headers['x-user-id'],
  };
}

/**
 * Middleware for adding flag context to requests
 */
export function flagContextMiddleware(req: any, res: any, next: any) {
  req.flagContext = extractFlagContextFromRequest(req);
  next();
}

/**
 * GraphQL guard for feature flags
 */
export function FlagGuard(flagKey: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = args[1]; // GraphQL context is usually the second argument
      const flagsService = this.flagsService || this.flagsServerService;
      
      if (!flagsService) {
        throw new Error('FlagsService not available');
      }

      const flagContext = extractFlagContextFromGraphQL(context);
      await flagsService.requireFlag(flagKey, flagContext);
      
      return method.apply(this, args);
    };

    return descriptor;
  };
}

// Export types and utilities
export * from './types';
export * from './decorators';
export * from './guards';