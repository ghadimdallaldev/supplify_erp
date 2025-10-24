import { CanActivate, ExecutionContext } from '@nestjs/common';
import { TenantAwareCacheService } from '@supplify/utils';
export interface FeatureFlagEvaluation {
    flagKey: string;
    enabled: boolean;
    reason: 'default' | 'rule' | 'override' | 'rollout';
    ruleId?: string;
    overrideId?: string;
    rolloutPercentage?: number;
    evaluatedAt: string;
}
export declare class FeatureFlagService {
    private cache;
    constructor(cache: TenantAwareCacheService);
    /**
     * Evaluate feature flag with full context
     */
    evaluateFlag(flagKey: string, context: {
        env: string;
        userId?: string;
        orgType?: string;
        clientId?: string;
    }): Promise<FeatureFlagEvaluation>;
    /**
     * Check if a flag is enabled (simple boolean check)
     */
    isFlagEnabled(flagKey: string, context: {
        env: string;
        userId?: string;
        orgType?: string;
        clientId?: string;
    }): Promise<boolean>;
    /**
     * Require a flag to be enabled (throws if disabled)
     */
    requireFlag(flagKey: string, context: {
        env: string;
        userId?: string;
        orgType?: string;
        clientId?: string;
    }): Promise<void>;
    /**
     * Get all flags for a context
     */
    getAllFlags(context: {
        env: string;
        userId?: string;
        orgType?: string;
        clientId?: string;
    }): Promise<Record<string, boolean>>;
    /**
     * Invalidate flag cache for a specific flag or all flags
     */
    invalidateFlagCache(flagKey?: string, context?: {
        env: string;
        userId?: string;
        clientId?: string;
    }): Promise<void>;
    /**
     * Publish flag change event
     */
    publishFlagChange(flagKey: string, oldValue: any, newValue: any): Promise<void>;
    private getFlagDefinition;
    private getAllFlagDefinitions;
    private getUserOverride;
    private getOrgOverride;
    private getOrgTypeOverride;
    private getApplicableRule;
    private isInRollout;
    private hashString;
}
export declare function RequireFlag(flagKey: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
export declare class FeatureFlagGuard implements CanActivate {
    private flagService;
    constructor(flagService: FeatureFlagService);
    canActivate(context: ExecutionContext): boolean | Promise<boolean>;
    private getFlagKeyFromContext;
}
//# sourceMappingURL=feature-flags.d.ts.map