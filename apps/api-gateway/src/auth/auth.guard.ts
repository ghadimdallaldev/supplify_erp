import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthService } from '@supplify/auth-proxy';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    const token = this.extractTokenFromHeader(req);
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const authResult = await this.authService.verifyAndProvision(token);
      
      // Attach user context to request
      req.user = authResult.user;
      req.organization = authResult.organization;
      req.clientId = authResult.organization?.id;
      
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid authentication token');
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
