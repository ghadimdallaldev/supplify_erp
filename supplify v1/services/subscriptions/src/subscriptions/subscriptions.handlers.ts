import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SubscriptionsService } from './subscriptions.service';

/**
 * RabbitMQ Message Handlers for Subscriptions
 */
@Controller()
export class SubscriptionsHandlers {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @MessagePattern('subscriptions.getPlans')
  async getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @MessagePattern('subscriptions.getPlanByCode')
  async getPlanByCode(@Payload() data: { code: string }) {
    return this.subscriptionsService.getPlanByCode(data.code);
  }

  @MessagePattern('subscriptions.getOrgSubscription')
  async getOrgSubscription(@Payload() data: { orgId: string; orgType: string }) {
    return this.subscriptionsService.getOrgSubscription(data.orgId, data.orgType);
  }

  @MessagePattern('subscriptions.getEntitlements')
  async getEntitlements(@Payload() data: { orgId: string; orgType: string }) {
    return this.subscriptionsService.getEntitlements(data.orgId, data.orgType);
  }

  @MessagePattern('subscriptions.assign')
  async assignSubscription(@Payload() data: any) {
    return this.subscriptionsService.assignSubscription(data);
  }

  @MessagePattern('subscriptions.update')
  async updateSubscription(@Payload() data: any) {
    return this.subscriptionsService.updateSubscription(data);
  }

  @MessagePattern('subscriptions.getEvents')
  async getSubscriptionEvents(@Payload() data: { orgId: string; orgType: string; limit?: number }) {
    return this.subscriptionsService.getSubscriptionEvents(data.orgId, data.orgType, data.limit);
  }

  @MessagePattern('subscriptions.getAll')
  async getAllSubscriptions(@Payload() filters?: any) {
    return this.subscriptionsService.getAllSubscriptions(filters);
  }

  @MessagePattern('subscriptions.getStats')
  async getSubscriptionStats() {
    return this.subscriptionsService.getSubscriptionStats();
  }
}

