import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthAdapter } from '../interfaces/auth.interface';

export const ROLES_KEY = 'roles';
export const TENANT_REQUIRED_KEY = 'tenantRequired';
export const TENANT_SCOPE_KEY = 'tenantScope';
export const REQUIRE_FLAG_KEY = 'requireFlag';

export const Roles = (roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);
export const TenantScope = (scope: 'SUPPLIER' | 'RESTAURANT' | 'ANY') => SetMetadata(TENANT_SCOPE_KEY, scope);
export const RequireFlag = (flagKey: string) => SetMetadata(REQUIRE_FLAG_KEY, flagKey);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authAdapter: AuthAdapter,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    const token = this.extractTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const authContext = await this.authAdapter.verifyBearer(token);
      
      // Attach auth context to request
      req.ctx = authContext;
      
      // Check role requirements
      const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      
      if (requiredRoles && requiredRoles.length > 0) {
        const hasRequiredRole = requiredRoles.some(role => authContext.roles.includes(role));
        if (!hasRequiredRole) {
          throw new UnauthorizedException(`Required roles: ${requiredRoles.join(', ')}`);
        }
      }

      // Check tenant requirements
      const tenantRequired = this.reflector.getAllAndOverride<boolean>(TENANT_REQUIRED_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (tenantRequired && !authContext.clientId) {
        throw new UnauthorizedException('Tenant client ID is required');
      }

      // Check tenant scope
      const tenantScope = this.reflector.getAllAndOverride<string>(TENANT_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (tenantScope && tenantScope !== 'ANY' && authContext.orgType !== tenantScope) {
        throw new UnauthorizedException(`Access denied: ${tenantScope} scope required`);
      }

      // Check feature flag requirements
      const requireFlag = this.reflector.getAllAndOverride<string>(REQUIRE_FLAG_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (requireFlag) {
        // TODO: Integrate with feature flags service
        // For now, we'll skip this check
        console.log(`Feature flag check required: ${requireFlag}`);
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractTokenFromHeader(request: any): string | null {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
