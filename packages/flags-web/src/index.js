"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagsService = void 0;
exports.useFeatureFlags = useFeatureFlags;
exports.useFeatureFlag = useFeatureFlag;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const rxjs_1 = require("rxjs");
const react_1 = require("react");
let FeatureFlagsService = class FeatureFlagsService {
    flagsClient;
    constructor(flagsClient) {
        this.flagsClient = flagsClient;
    }
    /**
     * Evaluate a single feature flag
     */
    async evaluateFlag(flagKey, context) {
        try {
            const result = await (0, rxjs_1.firstValueFrom)(this.flagsClient.send('flags.evaluate', {
                flagKey,
                context,
            }));
            return result;
        }
        catch (error) {
            console.error(`Failed to evaluate flag ${flagKey}:`, error);
            return { on: false, reason: 'evaluation_error' };
        }
    }
    /**
     * Check if a feature flag is enabled
     */
    async isEnabled(flagKey, context) {
        const result = await this.evaluateFlag(flagKey, context);
        return result.on;
    }
    /**
     * Require a feature flag to be enabled, throw error if not
     */
    async requireFlag(flagKey, context) {
        const result = await this.evaluateFlag(flagKey, context);
        if (!result.on) {
            const error = new Error(`Feature "${flagKey}" is not enabled`);
            error.code = 'FEATURE_FLAG_DISABLED';
            error.flagKey = flagKey;
            error.reason = result.reason;
            throw error;
        }
    }
    /**
     * Get all feature flags for a context
     */
    async getAllFlags(context) {
        try {
            const flags = await (0, rxjs_1.firstValueFrom)(this.flagsClient.send('flags.get.all', {}));
            // Evaluate each flag for the context
            const evaluatedFlags = await Promise.all(flags.map(async (flag) => {
                const evaluation = await this.evaluateFlag(flag.key, context);
                return {
                    ...flag,
                    status: evaluation.on ? 'ON' : 'OFF',
                    reason: evaluation.reason,
                    rolloutBucket: evaluation.rolloutBucket,
                };
            }));
            return evaluatedFlags;
        }
        catch (error) {
            console.error('Failed to get all flags:', error);
            return [];
        }
    }
};
exports.FeatureFlagsService = FeatureFlagsService;
exports.FeatureFlagsService = FeatureFlagsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [microservices_1.ClientProxy])
], FeatureFlagsService);
// Frontend hook for React
function useFeatureFlags() {
    const [flags, setFlags] = (0, react_1.useState)({});
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
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
                const flagsMap = {};
                flagsData.forEach((flag) => {
                    flagsMap[flag.key] = flag.status === 'ON';
                });
                setFlags(flagsMap);
            }
            catch (error) {
                console.error('Failed to load feature flags:', error);
            }
            finally {
                setLoading(false);
            }
        }
        loadFlags();
    }, []);
    return { flags, loading };
}
// React hook for evaluating a single flag
function useFeatureFlag(flagKey, context) {
    const [enabled, setEnabled] = (0, react_1.useState)(false);
    const [loading, setLoading] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
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
            }
            catch (error) {
                console.error(`Failed to evaluate flag ${flagKey}:`, error);
                setEnabled(false);
            }
            finally {
                setLoading(false);
            }
        }
        evaluateFlag();
    }, [flagKey, context?.orgType, context?.orgId, context?.userId]);
    return { enabled, loading };
}
//# sourceMappingURL=index.js.map