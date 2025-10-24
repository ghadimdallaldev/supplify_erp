export interface AuthContext {
  userId: string;
  email?: string;
  roles: string[];
  clientId: string;
  orgType: string;
  tier: string;
  token: string;
}

export interface AuthAdapter {
  verifyToken(token: string): Promise<AuthContext>;
  getPublicKey(): Promise<string>;
}

export interface KeycloakConfig {
  realmUrl: string;
  realm: string;
  clientId: string;
  clientSecret?: string;
}
