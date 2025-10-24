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
export declare function useFeatureFlags(): {
    flags: Record<string, boolean>;
    loading: boolean;
};
export declare function useFeatureFlag(flagKey: string, context?: FlagContext): {
    enabled: boolean;
    loading: boolean;
};
//# sourceMappingURL=index.d.ts.map