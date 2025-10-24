import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards, Inject, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/**
 * Feature Flags GraphQL Resolver
 */
@Resolver('FeatureFlag')
export class FlagsResolver {
  constructor(
    @Inject('FLAGS_SERVICE') private flagsClient: ClientProxy,
  ) {}

  private getContext(context: any): any {
    // Extract from JWT or use defaults
    return {
      env: process.env.NODE_ENV || 'development',
      orgType: context.req?.user?.orgType,
      orgId: context.req?.user?.orgId,
      userId: context.req?.user?.id,
    };
  }

  private isAdmin(context: any): boolean {
    return context.req?.user?.groups?.includes('admin') || false;
  }

  @Query('featureFlags')
  async featureFlags(@Context() context: any) {
    const ctx = this.getContext(context);

    return firstValueFrom(
      this.flagsClient.send('flags.getAll', { context: ctx }),
    );
  }

  @Query('featureFlag')
  async featureFlag(
    @Args('key') key: string,
    @Context() context: any,
  ) {
    const ctx = this.getContext(context);

    return firstValueFrom(
      this.flagsClient.send('flags.evaluate', { key, context: ctx }),
    );
  }

  @Query('flagsForEnvironment')
  async flagsForEnvironment(
    @Args('environment') environment: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.getForEnvironment', { environment }),
    );
  }

  @Query('flagAudit')
  async flagAudit(
    @Args('flagKey') flagKey: string,
    @Args('limit') limit: number = 50,
    @Context() context?: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.getAudit', { flagKey, limit }),
    );
  }

  @Mutation('upsertFlag')
  async upsertFlag(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.upsert', {
        ...input,
        actorId: context.req?.user?.id || 'admin',
      }),
    );
  }

  @Mutation('deleteFlag')
  async deleteFlag(
    @Args('key') key: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    // Implementation would go in flags.service.ts
    return true;
  }

  @Mutation('upsertRule')
  async upsertRule(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.upsertRule', {
        ...input,
        actorId: context.req?.user?.id || 'admin',
      }),
    );
  }

  @Mutation('deleteRule')
  async deleteRule(
    @Args('ruleId') ruleId: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    // Implementation would go in flags.service.ts
    return true;
  }

  @Mutation('createOverride')
  async createOverride(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.createOverride', {
        ...input,
        actorId: context.req?.user?.id || 'admin',
      }),
    );
  }

  @Mutation('deleteOverride')
  async deleteOverride(
    @Args('overrideId') overrideId: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.deleteOverride', {
        overrideId,
        actorId: context.req?.user?.id || 'admin',
      }),
    );
  }

  @Mutation('invalidateFlagCache')
  async invalidateFlagCache(
    @Args('flagKey') flagKey: string,
    @Args('environment') environment: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.flagsClient.send('flags.invalidateCache', {
        flagKey,
        environment,
      }),
    );
  }
}

