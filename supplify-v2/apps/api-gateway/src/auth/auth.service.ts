import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthContext } from '@supplify/auth-server';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserInfo(authContext: AuthContext) {
    // Get or create user in our database
    const user = await this.prisma.user.upsert({
      where: { keycloakId: authContext.userId },
      update: {
        email: authContext.email,
        name: authContext.email?.split('@')[0],
      },
      create: {
        keycloakId: authContext.userId,
        clientId: authContext.clientId,
        email: authContext.email,
        name: authContext.email?.split('@')[0],
      },
    });

    // Get or create organization
    const organization = await this.prisma.organization.upsert({
      where: { clientId: authContext.clientId },
      update: {
        type: authContext.orgType,
        tier: authContext.tier,
      },
      create: {
        clientId: authContext.clientId,
        name: `${authContext.orgType} Organization`,
        type: authContext.orgType,
        tier: authContext.tier,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        keycloakId: user.keycloakId,
      },
      organization: {
        id: organization.id,
        clientId: organization.clientId,
        name: organization.name,
        type: organization.type,
        tier: organization.tier,
      },
      roles: authContext.roles,
      token: authContext.token,
    };
  }
}
