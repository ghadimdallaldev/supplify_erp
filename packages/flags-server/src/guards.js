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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphQLFlagGuard = exports.FlagGuard = exports.FLAG_KEY_METADATA = void 0;
exports.RequireFlag = RequireFlag;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const index_1 = require("./index");
exports.FLAG_KEY_METADATA = 'flag_key';
/**
 * Decorator to mark a route/controller as requiring a feature flag
 */
function RequireFlag(flagKey) {
    return function (target, propertyName, descriptor) {
        Reflect.defineMetadata(exports.FLAG_KEY_METADATA, flagKey, descriptor.value);
        return descriptor;
    };
}
/**
 * Guard that checks feature flags before allowing access
 */
let FlagGuard = class FlagGuard {
    reflector;
    flagsService;
    constructor(reflector, flagsService) {
        this.reflector = reflector;
        this.flagsService = flagsService;
    }
    async canActivate(context) {
        const flagKey = this.reflector.get(exports.FLAG_KEY_METADATA, context.getHandler());
        if (!flagKey) {
            return true; // No flag requirement
        }
        const request = context.switchToHttp().getRequest();
        const flagContext = (0, index_1.extractFlagContextFromRequest)(request);
        try {
            await this.flagsService.requireFlag(flagKey, flagContext);
            return true;
        }
        catch (error) {
            throw new common_1.ForbiddenException(`Feature "${flagKey}" is not enabled`);
        }
    }
};
exports.FlagGuard = FlagGuard;
exports.FlagGuard = FlagGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object, typeof (_b = typeof index_1.FlagsServerService !== "undefined" && index_1.FlagsServerService) === "function" ? _b : Object])
], FlagGuard);
/**
 * GraphQL guard for feature flags
 */
let GraphQLFlagGuard = class GraphQLFlagGuard {
    flagsService;
    constructor(flagsService) {
        this.flagsService = flagsService;
    }
    async canActivate(context) {
        const flagKey = this.reflector.get(exports.FLAG_KEY_METADATA, context.getHandler());
        if (!flagKey) {
            return true; // No flag requirement
        }
        const gqlContext = context.getArgByIndex(2); // GraphQL context
        const flagContext = this.extractFlagContextFromGraphQL(gqlContext);
        try {
            await this.flagsService.requireFlag(flagKey, flagContext);
            return true;
        }
        catch (error) {
            throw new common_1.ForbiddenException(`Feature "${flagKey}" is not enabled`);
        }
    }
    extractFlagContextFromGraphQL(context) {
        const user = context.user || {};
        const headers = context.req?.headers || {};
        return {
            env: headers['x-environment'] || 'dev',
            orgType: user.orgType || headers['x-org-type'],
            orgId: user.orgId || headers['x-org-id'],
            userId: user.id || headers['x-user-id'],
        };
    }
};
exports.GraphQLFlagGuard = GraphQLFlagGuard;
exports.GraphQLFlagGuard = GraphQLFlagGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_c = typeof index_1.FlagsServerService !== "undefined" && index_1.FlagsServerService) === "function" ? _c : Object])
], GraphQLFlagGuard);
//# sourceMappingURL=guards.js.map