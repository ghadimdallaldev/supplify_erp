import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthAdapter } from '../interfaces/auth.interface';
export declare const ROLES_KEY = "roles";
export declare const TENANT_REQUIRED_KEY = "tenantRequired";
export declare const TENANT_SCOPE_KEY = "tenantScope";
export declare const REQUIRE_FLAG_KEY = "requireFlag";
export declare const Roles: (roles: string[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const TenantRequired: () => import("@nestjs/common").CustomDecorator<string>;
export declare const TenantScope: (scope: "SUPPLIER" | "RESTAURANT" | "ANY") => import("@nestjs/common").CustomDecorator<string>;
export declare const RequireFlag: (flagKey: string) => import("@nestjs/common").CustomDecorator<string>;
export declare class AuthGuard implements CanActivate {
    private authAdapter;
    private reflector;
    constructor(authAdapter: AuthAdapter, reflector: Reflector);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractTokenFromHeader;
}
//# sourceMappingURL=auth.guard.d.ts.map