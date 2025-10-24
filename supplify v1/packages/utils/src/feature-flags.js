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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeatureFlagGuard = exports.FeatureFlagService = void 0;
exports.RequireFlag = RequireFlag;
const common_1 = require("@nestjs/common");
const graphql_1 = require("@nestjs/graphql");
const utils_1 = require("@supplify/utils");
let FeatureFlagService = class FeatureFlagService {
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    /**
     * Evaluate feature flag with full context
     */
    async evaluateFlag(flagKey, context) {
        const cacheKey = `flags:${flagKey}:${context.env}:${context.clientId}:${context.userId}`;
        // Check cache first
        const cached = await this.cache.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Load flag definition
        const flag = await this.getFlagDefinition(flagKey);
        if (!flag) {
            throw new Error(`Feature flag '${flagKey}' not found`);
        }
        // Evaluate in order: Override → Rule → Default
        let evaluation = {
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
                }
                else if (rule.status === 'OFF') {
                    evaluation = {
                        flagKey,
                        enabled: false,
                        reason: 'rule',
                        ruleId: rule.id,
                        evaluatedAt: new Date().toISOString(),
                    };
                }
                else if (rule.status === 'ROLLOUT') {
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
    async isFlagEnabled(flagKey, context) {
        const evaluation = await this.evaluateFlag(flagKey, context);
        return evaluation.enabled;
    }
    /**
     * Require a flag to be enabled (throws if disabled)
     */
    async requireFlag(flagKey, context) {
        const enabled = await this.isFlagEnabled(flagKey, context);
        if (!enabled) {
            throw new common_1.ForbiddenException({
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
    async getAllFlags(context) {
        const flags = await this.getAllFlagDefinitions();
        const result = {};
        for (const flag of flags) {
            result[flag.key] = await this.isFlagEnabled(flag.key, context);
        }
        return result;
    }
    /**
     * Invalidate flag cache for a specific flag or all flags
     */
    async invalidateFlagCache(flagKey, context) {
        if (flagKey) {
            // Invalidate specific flag
            const pattern = context
                ? `flags:${flagKey}:${context.env}:${context.clientId}:${context.userId}`
                : `flags:${flagKey}:*`;
            await this.cache.delPattern(pattern);
        }
        else {
            // Invalidate all flags
            await this.cache.delPattern('flags:*');
        }
    }
    /**
     * Publish flag change event
     */
    async publishFlagChange(flagKey, oldValue, newValue) {
        // This would publish to RabbitMQ in a real implementation
        console.log(`Flag changed: ${flagKey}`, { oldValue, newValue });
        // Invalidate cache
        await this.invalidateFlagCache(flagKey);
    }
    // Private helper methods
    async getFlagDefinition(flagKey) {
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
    async getAllFlagDefinitions() {
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
    async getUserOverride(flagKey, userId, env) {
        // In real implementation, this would query the database
        return null;
    }
    async getOrgOverride(flagKey, clientId, env) {
        // In real implementation, this would query the database
        return null;
    }
    async getOrgTypeOverride(flagKey, orgType, env) {
        // In real implementation, this would query the database
        return null;
    }
    async getApplicableRule(flagKey, context) {
        // In real implementation, this would query the database
        return null;
    }
    isInRollout(identifier, percentage) {
        // Deterministic hash-based rollout
        const hash = this.hashString(identifier);
        return (hash % 100) < percentage;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }
};
exports.FeatureFlagService = FeatureFlagService;
exports.FeatureFlagService = FeatureFlagService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof utils_1.TenantAwareCacheService !== "undefined" && utils_1.TenantAwareCacheService) === "function" ? _a : Object])
], FeatureFlagService);
// Guard decorator for feature flags
function RequireFlag(flagKey) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const context = this.getTenantContext?.();
            if (!context) {
                throw new common_1.ForbiddenException('Tenant context required');
            }
            const flagService = this.getFeatureFlagService?.();
            if (!flagService) {
                throw new common_1.ForbiddenException('Feature flag service not available');
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
class FeatureFlagGuard {
    flagService;
    constructor(flagService) {
        this.flagService = flagService;
    }
    canActivate(context) {
        const gqlContext = graphql_1.GqlExecutionContext.create(context);
        const request = gqlContext.getContext().req;
        const tenant = request.tenant;
        if (!tenant) {
            throw new common_1.ForbiddenException('Tenant context required');
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
    getFlagKeyFromContext(context) {
        // This would extract the flag key from metadata in a real implementation
        return null;
    }
}
exports.FeatureFlagGuard = FeatureFlagGuard;
//# sourceMappingURL=feature-flags.js.map