import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { KeycloakAdapter } from '@supplify/auth-server';
import { AuthContext } from '@supplify/auth-server';

// Extend Express Request type to include our custom properties
declare global {
  namespace Express {
    interface Request {
      ctx?: AuthContext;
      requestId?: string;
    }
  }
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private keycloakAdapter: KeycloakAdapter;

  constructor(private configService: ConfigService) {
    const keycloakConfig = {
      realmUrl: this.configService.get('KEYCLOAK_URL', 'http://localhost:8080'),
      realm: this.configService.get('KEYCLOAK_REALM', 'Supplify'),
      clientId: this.configService.get('KEYCLOAK_CLIENT_ID', 'supplify-gateway'),
      clientSecret: this.configService.get('KEYCLOAK_CLIENT_SECRET'),
    };
    this.keycloakAdapter = new KeycloakAdapter(keycloakConfig);
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Generate request ID for tracing
    req.requestId = this.generateRequestId();

    // Skip auth for health check and public endpoints
    if (this.isPublicEndpoint(req.path)) {
      return next();
    }

    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing or invalid authorization header');
      }

      const token = authHeader.substring(7);
      
      // Verify token and extract auth context
      const authContext = await this.keycloakAdapter.verifyToken(token);
      
      // Attach auth context to request
      req.ctx = authContext;

      next();
    } catch (error) {
      throw new UnauthorizedException(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private isPublicEndpoint(path: string): boolean {
    const publicPaths = [
      '/health',
      '/api/docs',
      '/api/docs-json',
    ];
    
    return publicPaths.some(publicPath => 
      path === publicPath || path.startsWith(publicPath + '/')
    );
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
