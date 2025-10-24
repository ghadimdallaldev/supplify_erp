import { Injectable, Logger } from '@nestjs/common';
import { AuthAdapter, AuthContext, UserProfile } from '../interfaces/auth.interface';

@Injectable()
export class CognitoAdapter implements AuthAdapter {
  private readonly logger = new Logger(CognitoAdapter.name);

  async verifyBearer(token: string): Promise<AuthContext> {
    // TODO: Implement Cognito token verification
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async getUser(id: string): Promise<UserProfile> {
    // TODO: Implement Cognito user retrieval
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async setUserAttributes(id: string, attrs: Record<string, string>): Promise<void> {
    // TODO: Implement Cognito user attribute updates
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async assignRealmRoles(userId: string, roles: string[]): Promise<void> {
    // TODO: Implement Cognito role assignment
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async removeRealmRoles(userId: string, roles: string[]): Promise<void> {
    // TODO: Implement Cognito role removal
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async createUser(userData: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    attributes?: Record<string, string>;
  }): Promise<string> {
    // TODO: Implement Cognito user creation
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async updateUser(id: string, userData: Partial<UserProfile>): Promise<void> {
    // TODO: Implement Cognito user updates
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async deleteUser(id: string): Promise<void> {
    // TODO: Implement Cognito user deletion
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async getServiceToken(): Promise<string> {
    // TODO: Implement Cognito service token
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }

  async invalidateUserSessions(userId: string): Promise<void> {
    // TODO: Implement Cognito session invalidation
    this.logger.warn('CognitoAdapter not yet implemented');
    throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
  }
}
