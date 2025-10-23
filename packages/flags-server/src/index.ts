import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { Reflector } from '@nestjs/core';

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

// Decorator for requiring feature flags
export const RequireFeatureFlag = (flagKey: string) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const flagsService = this.featureFlagsService;
      if (!flagsService) {
        throw new Error('FeatureFlagsService not injected');
      }

      // Extract context from request or arguments
      const context: FlagContext = {
        env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
        // TODO: Extract orgType, orgId, userId from request context
      };

      await flagsService.requireFlag(flagKey, context);
      return method.apply(this, args);
    };

    return descriptor;
  };
};

// Guard for protecting routes based on feature flags
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private flagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFlags = this.reflector.get<string[]>('featureFlags', context.getHandler());
    
    if (!requiredFlags || requiredFlags.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // Extract context from request
    const flagContext: FlagContext = {
      env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
      orgType: request.user?.orgType,
      orgId: request.user?.orgId,
      userId: request.user?.id,
    };

    // Check all required flags
    for (const flagKey of requiredFlags) {
      const isEnabled = await this.flagsService.isEnabled(flagKey, flagContext);
      if (!isEnabled) {
        return false;
      }
    }

    return true;
  }
}

// Decorator for marking routes that require feature flags
export const RequireFlags = (...flags: string[]) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata('featureFlags', flags, descriptor.value);
    return descriptor;
  };
};

// Middleware for adding feature flag context to requests
export const FeatureFlagMiddleware = (flagsService: FeatureFlagsService) => {
  return async (req: any, res: any, next: any) => {
    try {
      const context: FlagContext = {
        env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
        orgType: req.user?.orgType,
        orgId: req.user?.orgId,
        userId: req.user?.id,
      };

      // Add feature flags to request object
      req.featureFlags = await flagsService.getAllFlags(context);
      req.featureFlagContext = context;
      
      next();
    } catch (error) {
      console.error('Feature flag middleware error:', error);
      req.featureFlags = [];
      req.featureFlagContext = {
        env: 'dev',
      };
      next();
    }
  };
};