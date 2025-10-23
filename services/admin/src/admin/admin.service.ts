import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { KeycloakAdapter } from '@supplify/auth-server';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(
    private keycloakAdapter: KeycloakAdapter,
    private prisma: PrismaService,
  ) {}

  async approveUser(userId: string, approvalData: {
    clientId: string;
    orgType: 'RESTAURANT' | 'SUPPLIER';
    roles: string[];
  }) {
    try {
      // Get user from Keycloak
      const user = await this.keycloakAdapter.getUser(userId);
      
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Create organization in database
      const organization = await this.prisma.organization.create({
        data: {
          id: approvalData.clientId,
          type: approvalData.orgType,
          name: `${approvalData.orgType} Organization`,
          email: user.email,
          ownerUserId: userId,
          tier: 'FREE',
          status: 'ACTIVE',
        },
      });

      // Update user attributes in Keycloak
      await this.keycloakAdapter.setUserAttributes(userId, {
        client_id: approvalData.clientId,
        org_type: approvalData.orgType,
        tier: 'FREE',
        status: 'APPROVED',
      });

      // Assign roles in Keycloak
      await this.keycloakAdapter.assignRealmRoles(userId, approvalData.roles);

      // Invalidate user sessions to force re-login with new claims
      await this.keycloakAdapter.invalidateUserSessions(userId);

      return {
        success: true,
        message: 'User approved successfully',
        organization,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to approve user: ${error.message}`);
    }
  }

  async rejectUser(userId: string, reason: string) {
    try {
      // Get user from Keycloak
      const user = await this.keycloakAdapter.getUser(userId);
      
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update user status to rejected
      await this.keycloakAdapter.setUserAttributes(userId, {
        status: 'REJECTED',
        rejection_reason: reason,
      });

      // Invalidate user sessions
      await this.keycloakAdapter.invalidateUserSessions(userId);

      return {
        success: true,
        message: 'User rejected successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Failed to reject user: ${error.message}`);
    }
  }

  async getPendingUsers() {
    try {
      // This would need to be implemented in KeycloakAdapter
      // For now, we'll return a placeholder
      return {
        users: [],
        total: 0,
      };
    } catch (error) {
      throw new BadRequestException(`Failed to get pending users: ${error.message}`);
    }
  }

  async generateClientId(orgType: 'RESTAURANT' | 'SUPPLIER', name: string): string {
    const prefix = orgType === 'RESTAURANT' ? 'rest' : 'supp';
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${slug}-${random}`;
  }
}
