import { jwtVerify, createRemoteJWKSet } from 'jose';
import { AuthAdapter, AuthContext, KeycloakConfig } from './types';

export class KeycloakAdapter implements AuthAdapter {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private config: KeycloakConfig;

  constructor(config: KeycloakConfig) {
    this.config = config;
    const jwksUrl = `${config.realmUrl}/realms/${config.realm}/protocol/openid-connect/certs`;
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verifyToken(token: string): Promise<AuthContext> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `${this.config.realmUrl}/realms/${this.config.realm}`,
        audience: this.config.clientId,
      });

      // Extract claims from JWT payload
      const userId = payload.sub as string;
      const email = payload.email as string | undefined;
      const clientId = payload.client_id as string || payload.azp as string;
      const orgType = payload.org_type as string || 'restaurant';
      const tier = payload.tier as string || 'basic';
      
      // Extract roles from realm_access or resource_access
      let roles: string[] = [];
      if (payload.realm_access?.roles) {
        roles = payload.realm_access.roles;
      }
      if (payload.resource_access?.[this.config.clientId]?.roles) {
        roles = [...roles, ...payload.resource_access[this.config.clientId].roles];
      }

      if (!userId || !clientId) {
        throw new Error('Invalid token: missing required claims');
      }

      return {
        userId,
        email,
        roles,
        clientId,
        orgType,
        tier,
        token,
      };
    } catch (error) {
      throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPublicKey(): Promise<string> {
    // This method is mainly for debugging or advanced use cases
    // The actual key verification is handled by jose library
    const jwksUrl = `${this.config.realmUrl}/realms/${this.config.realm}/protocol/openid-connect/certs`;
    const response = await fetch(jwksUrl);
    const jwks = await response.json();
    return JSON.stringify(jwks);
  }
}
