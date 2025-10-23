import { Injectable } from '@nestjs/common';

import { verifyToken, getUserRoleFromToken, UnauthorizedError, createLogger } from '@supplify/utils';

import { PrismaService } from '../prisma/prisma.service';

const logger = createLogger('auth-service');

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async verifyAndProvision(token: string) {
    const issuer = process.env.COGNITO_ISSUER;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!issuer || !clientId) {
      throw new UnauthorizedError('Cognito configuration missing');
    }

    // Verify JWT
    const payload = await verifyToken(token, issuer, clientId);
    const role = getUserRoleFromToken(payload) || 'RESTAURANT';
    
    // Extract tenant information from JWT
    const tenantClientId = payload['custom:client_id'] || payload.clientId;
    const orgType = payload['custom:org_type'] || payload.orgType || (role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT');

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { cognitoSub: payload.sub },
    });

    if (!user) {
      // First time login - provision user
      user = await this.prisma.user.create({
        data: {
          cognitoSub: payload.sub,
          email: payload.email,
          firstName: payload['cognito:username'] || payload.given_name || '',
          lastName: payload.family_name || '',
          role,
        },
      });

      logger.info(`User provisioned: ${user.id}`);
    }

    // Provision tenant if needed
    let organization = null;
    if (tenantClientId) {
      organization = await this.prisma.organization.findUnique({
        where: { id: tenantClientId },
      });

      if (!organization) {
        // Create organization for this tenant
        organization = await this.prisma.organization.create({
          data: {
            id: tenantClientId,
            type: orgType,
            name: payload['custom:org_name'] || payload.orgName || `${role} Organization`,
            email: payload.email,
            ownerUserId: user.id,
            tier: 'FREE',
            status: 'ACTIVE',
          },
        });

        // Add user as owner of the organization
        await this.prisma.membership.create({
          data: {
            userId: user.id,
            clientId: tenantClientId,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });

        logger.info(`Organization provisioned: ${organization.id}`);
      } else {
        // Ensure user is a member of the organization
        const membership = await this.prisma.membership.findUnique({
          where: {
            userId_clientId: {
              userId: user.id,
              clientId: tenantClientId,
            },
          },
        });

        if (!membership) {
          await this.prisma.membership.create({
            data: {
              userId: user.id,
              clientId: tenantClientId,
              role: 'MEMBER',
              status: 'ACTIVE',
            },
          });

          logger.info(`User added to organization: ${user.id} -> ${tenantClientId}`);
        }
      }
    }

    return {
      user,
      organization,
      token: payload,
      tenant: {
        clientId: tenantClientId,
        orgType,
        role: role.toLowerCase(),
      },
    };
  }

  async me(cognitoSub: string) {
    const user = await this.prisma.user.findUnique({
      where: { cognitoSub },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return user;
  }

  async getUserOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: {
        organization: true,
      },
    });

    return memberships.map(membership => ({
      ...membership.organization,
      role: membership.role,
      status: membership.status,
    }));
  }

  async switchTenant(userId: string, clientId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_clientId: {
          userId,
          clientId,
        },
      },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      throw new UnauthorizedError('User is not a member of this organization');
    }

    if (membership.status !== 'ACTIVE') {
      throw new UnauthorizedError('Membership is not active');
    }

    return {
      organization: membership.organization,
      role: membership.role,
    };
  }
}

