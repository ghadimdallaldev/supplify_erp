import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserManagementService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new tenant organization with client ID
   */
  async createTenant(data: {
    clientId: string;
    orgType: 'RESTAURANT' | 'SUPPLIER';
    name: string;
    email: string;
    ownerUserId: string;
  }) {
    return this.prisma.organization.create({
      data: {
        id: data.clientId,
        type: data.orgType,
        name: data.name,
        email: data.email,
        ownerUserId: data.ownerUserId,
      },
    });
  }

  /**
   * Get user's client ID from their organization
   */
  async getUserClientId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    return user?.organization?.id || null;
  }

  /**
   * Get user's organization details
   */
  async getUserOrganization(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    return user?.organization || null;
  }

  /**
   * Check if client ID exists
   */
  async clientIdExists(clientId: string): Promise<boolean> {
    const org = await this.prisma.organization.findUnique({
      where: { id: clientId },
    });

    return !!org;
  }

  /**
   * Generate unique client ID
   */
  generateClientId(orgType: 'RESTAURANT' | 'SUPPLIER', name: string): string {
    const prefix = orgType === 'RESTAURANT' ? 'rest' : 'supp';
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${slug}-${random}`;
  }

  /**
   * Get all users for a client ID
   */
  async getTenantUsers(clientId: string) {
    return this.prisma.user.findMany({
      where: { organizationId: clientId },
      include: { organization: true },
    });
  }

  /**
   * Add user to tenant organization
   */
  async addUserToTenant(userId: string, clientId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { organizationId: clientId },
    });
  }

  /**
   * Remove user from tenant organization
   */
  async removeUserFromTenant(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { organizationId: null },
    });
  }

  /**
   * Get tenant statistics
   */
  async getTenantStats(clientId: string) {
    const [userCount, org] = await Promise.all([
      this.prisma.user.count({
        where: { organizationId: clientId },
      }),
      this.prisma.organization.findUnique({
        where: { id: clientId },
      }),
    ]);

    return {
      clientId,
      orgType: org?.type,
      name: org?.name,
      userCount,
      createdAt: org?.createdAt,
    };
  }
}
