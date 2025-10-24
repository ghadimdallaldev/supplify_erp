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
exports.AuthGuard = exports.RequireFlag = exports.TenantScope = exports.TenantRequired = exports.Roles = exports.REQUIRE_FLAG_KEY = exports.TENANT_SCOPE_KEY = exports.TENANT_REQUIRED_KEY = exports.ROLES_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const graphql_1 = require("@nestjs/graphql");
exports.ROLES_KEY = 'roles';
exports.TENANT_REQUIRED_KEY = 'tenantRequired';
exports.TENANT_SCOPE_KEY = 'tenantScope';
exports.REQUIRE_FLAG_KEY = 'requireFlag';
const Roles = (roles) => (0, common_1.SetMetadata)(exports.ROLES_KEY, roles);
exports.Roles = Roles;
const TenantRequired = () => (0, common_1.SetMetadata)(exports.TENANT_REQUIRED_KEY, true);
exports.TenantRequired = TenantRequired;
const TenantScope = (scope) => (0, common_1.SetMetadata)(exports.TENANT_SCOPE_KEY, scope);
exports.TenantScope = TenantScope;
const RequireFlag = (flagKey) => (0, common_1.SetMetadata)(exports.REQUIRE_FLAG_KEY, flagKey);
exports.RequireFlag = RequireFlag;
let AuthGuard = class AuthGuard {
    authAdapter;
    reflector;
    constructor(authAdapter, reflector) {
        this.authAdapter = authAdapter;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const gqlContext = graphql_1.GqlExecutionContext.create(context);
        const { req } = gqlContext.getContext();
        const token = this.extractTokenFromHeader(req);
        if (!token) {
            throw new common_1.UnauthorizedException('No authentication token provided');
        }
        try {
            const authContext = await this.authAdapter.verifyBearer(token);
            // Attach auth context to request
            req.ctx = authContext;
            // Check role requirements
            const requiredRoles = this.reflector.getAllAndOverride(exports.ROLES_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (requiredRoles && requiredRoles.length > 0) {
                const hasRequiredRole = requiredRoles.some(role => authContext.roles.includes(role));
                if (!hasRequiredRole) {
                    throw new common_1.UnauthorizedException(`Required roles: ${requiredRoles.join(', ')}`);
                }
            }
            // Check tenant requirements
            const tenantRequired = this.reflector.getAllAndOverride(exports.TENANT_REQUIRED_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (tenantRequired && !authContext.clientId) {
                throw new common_1.UnauthorizedException('Tenant client ID is required');
            }
            // Check tenant scope
            const tenantScope = this.reflector.getAllAndOverride(exports.TENANT_SCOPE_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (tenantScope && tenantScope !== 'ANY' && authContext.orgType !== tenantScope) {
                throw new common_1.UnauthorizedException(`Access denied: ${tenantScope} scope required`);
            }
            // Check feature flag requirements
            const requireFlag = this.reflector.getAllAndOverride(exports.REQUIRE_FLAG_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);
            if (requireFlag) {
                // TODO: Integrate with feature flags service
                // For now, we'll skip this check
                console.log(`Feature flag check required: ${requireFlag}`);
            }
            return true;
        }
        catch (error) {
            throw new common_1.UnauthorizedException(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    extractTokenFromHeader(request) {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
            return null;
        }
        const [type, token] = authHeader.split(' ');
        return type === 'Bearer' ? token : null;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object, core_1.Reflector])
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map