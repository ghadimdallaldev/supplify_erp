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
exports.FeatureFlagMiddleware = exports.RequireFlags = exports.FeatureFlagGuard = exports.RequireFeatureFlag = exports.FeatureFlagsService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const rxjs_1 = require("rxjs");
const core_1 = require("@nestjs/core");
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
// Decorator for requiring feature flags
const RequireFeatureFlag = (flagKey) => {
    return (target, propertyName, descriptor) => {
        const method = descriptor.value;
        descriptor.value = async function (...args) {
            const flagsService = this.featureFlagsService;
            if (!flagsService) {
                throw new Error('FeatureFlagsService not injected');
            }
            // Extract context from request or arguments
            const context = {
                env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
                // TODO: Extract orgType, orgId, userId from request context
            };
            await flagsService.requireFlag(flagKey, context);
            return method.apply(this, args);
        };
        return descriptor;
    };
};
exports.RequireFeatureFlag = RequireFeatureFlag;
// Guard for protecting routes based on feature flags
let FeatureFlagGuard = class FeatureFlagGuard {
    reflector;
    flagsService;
    constructor(reflector, flagsService) {
        this.reflector = reflector;
        this.flagsService = flagsService;
    }
    async canActivate(context) {
        const requiredFlags = this.reflector.get('featureFlags', context.getHandler());
        if (!requiredFlags || requiredFlags.length === 0) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        // Extract context from request
        const flagContext = {
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
};
exports.FeatureFlagGuard = FeatureFlagGuard;
exports.FeatureFlagGuard = FeatureFlagGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object, FeatureFlagsService])
], FeatureFlagGuard);
// Decorator for marking routes that require feature flags
const RequireFlags = (...flags) => {
    return (target, propertyName, descriptor) => {
        Reflect.defineMetadata('featureFlags', flags, descriptor.value);
        return descriptor;
    };
};
exports.RequireFlags = RequireFlags;
// Middleware for adding feature flag context to requests
const FeatureFlagMiddleware = (flagsService) => {
    return async (req, res, next) => {
        try {
            const context = {
                env: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
                orgType: req.user?.orgType,
                orgId: req.user?.orgId,
                userId: req.user?.id,
            };
            // Add feature flags to request object
            req.featureFlags = await flagsService.getAllFlags(context);
            req.featureFlagContext = context;
            next();
        }
        catch (error) {
            console.error('Feature flag middleware error:', error);
            req.featureFlags = [];
            req.featureFlagContext = {
                env: 'dev',
            };
            next();
        }
    };
};
exports.FeatureFlagMiddleware = FeatureFlagMiddleware;
//# sourceMappingURL=index.js.map