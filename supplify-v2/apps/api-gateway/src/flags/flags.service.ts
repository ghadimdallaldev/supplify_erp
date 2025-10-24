import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthContext } from '@supplify/auth-server';
import { FeatureFlagScope } from '@prisma/client';

@Injectable()
export class FlagsService {
  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveFlags(authContext: AuthContext) {
    const flags = await this.prisma.featureFlag.findMany({
      where: {
        OR: [
          { scope: FeatureFlagScope.GLOBAL },
          { 
            scope: FeatureFlagScope.TENANT, 
            clientId: authContext.clientId 
          },
          { 
            scope: FeatureFlagScope.USER, 
            clientId: authContext.clientId,
            userId: authContext.userId 
          },
        ],
      },
    });

    // Return flags as key-value pairs
    return flags.reduce((acc, flag) => {
      acc[flag.key] = flag.enabled;
      return acc;
    }, {} as Record<string, boolean>);
  }

  async toggleFlag(authContext: AuthContext, key: string, enabled: boolean, scope?: string) {
    // Check if user has admin role
    if (!authContext.roles.includes('admin')) {
      throw new Error('Insufficient permissions');
    }

    const flagScope = scope as FeatureFlagScope || FeatureFlagScope.TENANT;
    
    return await this.prisma.featureFlag.upsert({
      where: {
        key_scope_clientId_userId: {
          key,
          scope: flagScope,
          clientId: flagScope === FeatureFlagScope.GLOBAL ? null : authContext.clientId,
          userId: flagScope === FeatureFlagScope.USER ? authContext.userId : null,
        },
      },
      update: { enabled },
      create: {
        key,
        enabled,
        scope: flagScope,
        clientId: flagScope === FeatureFlagScope.GLOBAL ? null : authContext.clientId,
        userId: flagScope === FeatureFlagScope.USER ? authContext.userId : null,
      },
    });
  }
}
