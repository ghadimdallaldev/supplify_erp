import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards, Inject, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/**
 * Subscriptions GraphQL Resolver
 */
@Resolver('Subscription')
export class SubscriptionsResolver {
  constructor(
    @Inject('SUBSCRIPTIONS_SERVICE') private subscriptionsClient: ClientProxy,
  ) {}

  /**
   * Get restaurantId or supplierId from JWT context
   */
  private getOrgContext(context: any): { orgId: string; orgType: string } {
    // TODO: Extract from Cognito JWT
    // For now, use from context or default
    return {
      orgId: context.req?.user?.orgId || context.orgId || 'rest-demo-001',
      orgType: context.req?.user?.orgType || context.orgType || 'RESTAURANT',
    };
  }

  /**
   * Check if user is admin
   */
  private isAdmin(context: any): boolean {
    // TODO: Check Cognito groups
    return context.req?.user?.groups?.includes('admin') || false;
  }

  @Query('myEntitlements')
  async myEntitlements(
    @Args('orgType') orgType: string,
    @Context() context: any,
  ) {
    const { orgId } = this.getOrgContext(context);

    return firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getEntitlements', {
        orgId,
        orgType,
      }),
    );
  }

  @Query('subscriptionForOrg')
  async subscriptionForOrg(
    @Args('orgId') orgId: string,
    @Args('orgType') orgType: string,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    const subscription = await firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getOrgSubscription', {
        orgId,
        orgType,
      }),
    );

    // Get resolved entitlements
    const entitlements = await firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getEntitlements', {
        orgId,
        orgType,
      }),
    );

    return {
      ...subscription,
      entitlements,
    };
  }

  @Query('subscriptionPlans')
  async subscriptionPlans() {
    return firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getPlans', {}),
    );
  }

  @Query('allSubscriptions')
  async allSubscriptions(
    @Args('orgType') orgType?: string,
    @Args('planCode') planCode?: string,
    @Args('status') status?: string,
    @Context() context?: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getAll', {
        orgType,
        planCode,
        status,
      }),
    );
  }

  @Query('subscriptionStats')
  async subscriptionStats(@Context() context: any) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.subscriptionsClient.send('subscriptions.getStats', {}),
    );
  }

  @Mutation('assignSubscription')
  async assignSubscription(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    const result = await firstValueFrom(
      this.subscriptionsClient.send('subscriptions.assign', {
        ...input,
        assignedBy: context.req?.user?.id || 'admin',
      }),
    );

    // Emit event
    await firstValueFrom(
      this.subscriptionsClient.emit('subscription.assigned', {
        orgId: input.orgId,
        orgType: input.orgType,
        planCode: input.planCode,
        timestamp: new Date(),
      }),
    );

    return result;
  }

  @Mutation('updateSubscription')
  async updateSubscription(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    const result = await firstValueFrom(
      this.subscriptionsClient.send('subscriptions.update', {
        ...input,
        updatedBy: context.req?.user?.id || 'admin',
      }),
    );

    // Emit event
    await firstValueFrom(
      this.subscriptionsClient.emit('subscription.updated', {
        subscriptionId: input.subscriptionId,
        timestamp: new Date(),
      }),
    );

    return result;
  }
}

