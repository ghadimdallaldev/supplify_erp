"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminOverride = exports.TenantScope = exports.TenantRequired = exports.TenantContextMiddleware = void 0;
exports.getTenantContext = getTenantContext;
exports.getTenantContextFromRequest = getTenantContextFromRequest;
const common_1 = require("@nestjs/common");
const graphql_1 = require("@nestjs/graphql");
let TenantContextMiddleware = class TenantContextMiddleware {
    async use(req, res, next) {
        try {
            const tenant = await this.extractTenantContext(req);
            req.tenant = tenant;
            next();
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid tenant context');
        }
    }
    async extractTenantContext(req) {
        // Extract from JWT token (primary method)
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const tenant = await this.extractFromJWT(token);
            if (tenant)
                return tenant;
        }
        // Fallback: Extract from headers (for admin tools)
        const clientId = req.headers['x-client-id'];
        const impersonatedClientId = req.headers['x-impersonate-client-id'];
        if (clientId || impersonatedClientId) {
            return await this.extractFromHeaders(req, clientId, impersonatedClientId);
        }
        throw new common_1.UnauthorizedException('No tenant context found');
    }
    async extractFromJWT(token) {
        try {
            // In production, this would verify the JWT with Cognito
            // For now, we'll decode and extract claims
            const payload = this.decodeJWT(token);
            if (!payload)
                return null;
            const clientId = payload['custom:client_id'] || payload.clientId;
            const orgType = payload['custom:org_type'] || payload.orgType;
            const role = payload.role || payload['custom:role'];
            if (!clientId || !orgType || !role)
                return null;
            return {
                clientId,
                userId: payload.sub,
                role: role.toLowerCase(),
                orgType: orgType.toUpperCase(),
                email: payload.email,
                isImpersonated: false,
            };
        }
        catch (error) {
            return null;
        }
    }
    async extractFromHeaders(req, clientId, impersonatedClientId) {
        // This is for admin tools and impersonation
        const userId = req.headers['x-user-id'];
        const role = req.headers['x-user-role'];
        const email = req.headers['x-user-email'];
        if (!userId || !role || !email) {
            throw new common_1.UnauthorizedException('Missing required headers for admin context');
        }
        const targetClientId = impersonatedClientId || clientId;
        if (!targetClientId) {
            throw new common_1.UnauthorizedException('Missing clientId');
        }
        // Verify admin role for impersonation
        if (impersonatedClientId && role !== 'admin') {
            throw new common_1.ForbiddenException('Only admins can impersonate tenants');
        }
        return {
            clientId: targetClientId,
            userId,
            role: role.toLowerCase(),
            orgType: impersonatedClientId ? 'RESTAURANT' : 'ADMIN', // Simplified for admin tools
            email,
            isImpersonated: !!impersonatedClientId,
            impersonatedBy: impersonatedClientId ? userId : undefined,
        };
    }
    decodeJWT(token) {
        try {
            // Simple JWT decode (in production, use proper verification)
            const parts = token.split('.');
            if (parts.length !== 3)
                return null;
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload;
        }
        catch (error) {
            return null;
        }
    }
};
exports.TenantContextMiddleware = TenantContextMiddleware;
exports.TenantContextMiddleware = TenantContextMiddleware = __decorate([
    (0, common_1.Injectable)()
], TenantContextMiddleware);
// Guard Decorators
const TenantRequired = () => {
    return (target, propertyKey, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const context = this.getTenantContext?.();
            if (!context?.clientId) {
                throw new common_1.UnauthorizedException('Tenant context required');
            }
            return originalMethod.apply(this, args);
        };
    };
};
exports.TenantRequired = TenantRequired;
const TenantScope = (allowedTypes) => {
    return (target, propertyKey, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const context = this.getTenantContext?.();
            if (!context?.clientId) {
                throw new common_1.UnauthorizedException('Tenant context required');
            }
            if (!allowedTypes.includes('any') && !allowedTypes.includes(context.role)) {
                throw new common_1.ForbiddenException(`Access denied. Required: ${allowedTypes.join(' or ')}, got: ${context.role}`);
            }
            return originalMethod.apply(this, args);
        };
    };
};
exports.TenantScope = TenantScope;
const AdminOverride = () => {
    return (target, propertyKey, descriptor) => {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const context = this.getTenantContext?.();
            if (!context?.clientId) {
                throw new common_1.UnauthorizedException('Tenant context required');
            }
            if (context.role !== 'admin') {
                throw new common_1.ForbiddenException('Admin access required');
            }
            // Log admin action for audit
            if (context.isImpersonated) {
                console.log(`Admin ${context.impersonatedBy} impersonating tenant ${context.clientId} for action ${propertyKey}`);
            }
            return originalMethod.apply(this, args);
        };
    };
};
exports.AdminOverride = AdminOverride;
// GraphQL Context Extractor
function getTenantContext(context) {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const request = gqlContext.getContext().req;
    return request.tenant;
}
// REST Context Extractor
function getTenantContextFromRequest(req) {
    return req.tenant;
}
//# sourceMappingURL=tenant-context.js.map