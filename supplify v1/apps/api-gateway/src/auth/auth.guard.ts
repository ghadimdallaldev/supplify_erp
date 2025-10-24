import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
// import { KeycloakAdapter } from '@supplify/auth-server';

@Injectable()
export class AuthGuard implements CanActivate {
  // constructor(private keycloakAdapter: KeycloakAdapter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    const token = this.extractTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      // Mock auth context for now
      const authContext = {
        userId: 'mock-user-id',
        email: 'mock@example.com',
        clientId: 'mock-client-id',
        orgType: 'RESTAURANT',
        roles: ['restaurant']
      };
      
      // Attach auth context to request
      req.ctx = authContext;
      req.user = {
        id: authContext.userId,
        email: authContext.email,
        role: authContext.orgType,
        organizationId: authContext.clientId,
      };
      req.organization = {
        id: authContext.clientId,
        type: authContext.orgType,
      };
      req.clientId = authContext.clientId;
      
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
