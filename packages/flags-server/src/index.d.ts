import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
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
export declare class FeatureFlagsService {
    private flagsClient;
    constructor(flagsClient: ClientProxy);
    /**
     * Evaluate a single feature flag
     */
    evaluateFlag(flagKey: string, context: FlagContext): Promise<FlagEvaluationResult>;
    /**
     * Check if a feature flag is enabled
     */
    isEnabled(flagKey: string, context: FlagContext): Promise<boolean>;
    /**
     * Require a feature flag to be enabled, throw error if not
     */
    requireFlag(flagKey: string, context: FlagContext): Promise<void>;
    /**
     * Get all feature flags for a context
     */
    getAllFlags(context: FlagContext): Promise<any[]>;
}
export declare const RequireFeatureFlag: (flagKey: string) => (target: any, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare class FeatureFlagGuard implements CanActivate {
    private reflector;
    private flagsService;
    constructor(reflector: Reflector, flagsService: FeatureFlagsService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare const RequireFlags: (...flags: string[]) => (target: any, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare const FeatureFlagMiddleware: (flagsService: FeatureFlagsService) => (req: any, res: any, next: any) => Promise<void>;
//# sourceMappingURL=index.d.ts.map