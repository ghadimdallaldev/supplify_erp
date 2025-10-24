import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @Get('plans/:code')
  async getPlanByCode(@Param('code') code: string) {
    return this.subscriptionsService.getPlanByCode(code);
  }

  @Get('org/:orgId')
  async getOrgSubscription(
    @Param('orgId') orgId: string,
    @Query('orgType') orgType: string,
  ) {
    return this.subscriptionsService.getOrgSubscription(orgId, orgType);
  }

  @Get('entitlements/:orgId')
  async getEntitlements(
    @Param('orgId') orgId: string,
    @Query('orgType') orgType: string,
  ) {
    return this.subscriptionsService.getEntitlements(orgId, orgType);
  }

  @Post('assign')
  async assignSubscription(@Body() data: any) {
    return this.subscriptionsService.assignSubscription(data);
  }

  @Put('update')
  async updateSubscription(@Body() data: any) {
    return this.subscriptionsService.updateSubscription(data);
  }

  @Get('events/:orgId')
  async getSubscriptionEvents(
    @Param('orgId') orgId: string,
    @Query('orgType') orgType: string,
    @Query('limit') limit?: string,
  ) {
    return this.subscriptionsService.getSubscriptionEvents(
      orgId,
      orgType,
      limit ? parseInt(limit) : undefined,
    );
  }

  @Get('admin/all')
  async getAllSubscriptions(
    @Query('orgType') orgType?: string,
    @Query('planCode') planCode?: string,
    @Query('status') status?: string,
  ) {
    return this.subscriptionsService.getAllSubscriptions({
      orgType,
      planCode,
      status,
    });
  }

  @Get('admin/stats')
  async getSubscriptionStats() {
    return this.subscriptionsService.getSubscriptionStats();
  }
}

