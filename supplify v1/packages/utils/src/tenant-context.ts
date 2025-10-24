import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
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

@Injectable()
export class TenantContextMiddleware {
  async use(req: TenantRequest, res: Response, next: Function) {
    try {
      const tenant = await this.extractTenantContext(req);
      req.tenant = tenant;
      next();
    } catch (error) {
      throw new UnauthorizedException('Invalid tenant context');
    }
  }

  private async extractTenantContext(req: Request): Promise<TenantContext> {
    // Extract from JWT token (primary method)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const tenant = await this.extractFromJWT(token);
      if (tenant) return tenant;
    }

    // Fallback: Extract from headers (for admin tools)
    const clientId = req.headers['x-client-id'] as string;
    const impersonatedClientId = req.headers['x-impersonate-client-id'] as string;
    
    if (clientId || impersonatedClientId) {
      return await this.extractFromHeaders(req, clientId, impersonatedClientId);
    }

    throw new UnauthorizedException('No tenant context found');
  }

  private async extractFromJWT(token: string): Promise<TenantContext | null> {
    try {
      // In production, this would verify the JWT with Cognito
      // For now, we'll decode and extract claims
      const payload = this.decodeJWT(token);
      
      if (!payload) return null;

      const clientId = payload['custom:client_id'] || payload.clientId;
      const orgType = payload['custom:org_type'] || payload.orgType;
      const role = payload.role || payload['custom:role'];

      if (!clientId || !orgType || !role) return null;

      return {
        clientId,
        userId: payload.sub,
        role: role.toLowerCase(),
        orgType: orgType.toUpperCase(),
        email: payload.email,
        isImpersonated: false,
      };
    } catch (error) {
      return null;
    }
  }

  private async extractFromHeaders(req: Request, clientId?: string, impersonatedClientId?: string): Promise<TenantContext> {
    // This is for admin tools and impersonation
    const userId = req.headers['x-user-id'] as string;
    const role = req.headers['x-user-role'] as string;
    const email = req.headers['x-user-email'] as string;

    if (!userId || !role || !email) {
      throw new UnauthorizedException('Missing required headers for admin context');
    }

    const targetClientId = impersonatedClientId || clientId;
    if (!targetClientId) {
      throw new UnauthorizedException('Missing clientId');
    }

    // Verify admin role for impersonation
    if (impersonatedClientId && role !== 'admin') {
      throw new ForbiddenException('Only admins can impersonate tenants');
    }

    return {
      clientId: targetClientId,
      userId,
      role: role.toLowerCase() as any,
      orgType: impersonatedClientId ? 'RESTAURANT' : 'ADMIN', // Simplified for admin tools
      email,
      isImpersonated: !!impersonatedClientId,
      impersonatedBy: impersonatedClientId ? userId : undefined,
    };
  }

  private decodeJWT(token: string): any {
    try {
      // Simple JWT decode (in production, use proper verification)
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      return payload;
    } catch (error) {
      return null;
    }
  }
}

// Guard Decorators
export const TenantRequired = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const context = this.getTenantContext?.();
      if (!context?.clientId) {
        throw new UnauthorizedException('Tenant context required');
      }
      return originalMethod.apply(this, args);
    };
  };
};

export const TenantScope = (allowedTypes: ('supplier' | 'restaurant' | 'any')[]) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const context = this.getTenantContext?.();
      if (!context?.clientId) {
        throw new UnauthorizedException('Tenant context required');
      }

      if (!allowedTypes.includes('any') && !allowedTypes.includes(context.role as any)) {
        throw new ForbiddenException(`Access denied. Required: ${allowedTypes.join(' or ')}, got: ${context.role}`);
      }

      return originalMethod.apply(this, args);
    };
  };
};

export const AdminOverride = () => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const context = this.getTenantContext?.();
      if (!context?.clientId) {
        throw new UnauthorizedException('Tenant context required');
      }

      if (context.role !== 'admin') {
        throw new ForbiddenException('Admin access required');
      }

      // Log admin action for audit
      if (context.isImpersonated) {
        console.log(`Admin ${context.impersonatedBy} impersonating tenant ${context.clientId} for action ${propertyKey}`);
      }

      return originalMethod.apply(this, args);
    };
  };
};

// GraphQL Context Extractor
export function getTenantContext(context: ExecutionContext): TenantContext {
  const gqlContext = GqlExecutionContext.create(context);
  const request = gqlContext.getContext().req as TenantRequest;
  return request.tenant;
}

// REST Context Extractor
export function getTenantContextFromRequest(req: TenantRequest): TenantContext {
  return req.tenant;
}
