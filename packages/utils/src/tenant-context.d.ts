import { ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
export interface TenantContext {
    clientId: string;
    userId: string;
    role: 'admin' | 'restaurant' | 'supplier';
    orgType: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
    email: string;
    isImpersonated?: boolean;
    impersonatedBy?: string;
}
export interface TenantRequest extends Request {
    tenant: TenantContext;
}
export declare class TenantContextMiddleware {
    use(req: TenantRequest, res: Response, next: Function): Promise<void>;
    private extractTenantContext;
    private extractFromJWT;
    private extractFromHeaders;
    private decodeJWT;
}
export declare const TenantRequired: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
export declare const TenantScope: (allowedTypes: ("supplier" | "restaurant" | "any")[]) => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
export declare const AdminOverride: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;
export declare function getTenantContext(context: ExecutionContext): TenantContext;
export declare function getTenantContextFromRequest(req: TenantRequest): TenantContext;
//# sourceMappingURL=tenant-context.d.ts.map