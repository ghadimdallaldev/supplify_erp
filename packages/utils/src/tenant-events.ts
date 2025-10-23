import { Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { TenantContext } from '@supplify/utils';

@Injectable()
export class TenantAwareEventService {
  constructor(private client: ClientProxy) {}

  private tenantContext?: TenantContext;

  setTenantContext(context: TenantContext) {
    this.tenantContext = context;
  }

  private getClientId(): string {
    if (!this.tenantContext?.clientId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.clientId;
  }

  // Generate tenant-scoped routing key
  private getTenantRoutingKey(baseKey: string): string {
    return `tenant.${this.getClientId()}.${baseKey}`;
  }

  // Emit tenant-scoped events
  async emitEvent(pattern: string, data: any): Promise<void> {
    const tenantPattern = this.getTenantRoutingKey(pattern);
    const eventData = {
      ...data,
      tenant: {
        clientId: this.getClientId(),
        userId: this.tenantContext?.userId,
        role: this.tenantContext?.role,
        orgType: this.tenantContext?.orgType,
        isImpersonated: this.tenantContext?.isImpersonated,
        impersonatedBy: this.tenantContext?.impersonatedBy,
      },
      timestamp: new Date().toISOString(),
    };

    this.client.emit(tenantPattern, eventData);
  }

  // Order events
  async emitOrderCreated(order: any): Promise<void> {
    await this.emitEvent('orders.created', { order });
  }

  async emitOrderStatusChanged(orderId: string, from: string, to: string, order: any): Promise<void> {
    await this.emitEvent('orders.status.changed', {
      orderId,
      from,
      to,
      order,
    });
  }

  async emitOrderDelivered(orderId: string, order: any): Promise<void> {
    await this.emitEvent('orders.delivered', {
      orderId,
      order,
    });
  }

  async emitOrderCancelled(orderId: string, reason: string, order: any): Promise<void> {
    await this.emitEvent('orders.cancelled', {
      orderId,
      reason,
      order,
    });
  }

  // Product events
  async emitProductCreated(product: any): Promise<void> {
    await this.emitEvent('products.created', { product });
  }

  async emitProductUpdated(productId: string, changes: any, product: any): Promise<void> {
    await this.emitEvent('products.updated', {
      productId,
      changes,
      product,
    });
  }

  async emitProductDeleted(productId: string, product: any): Promise<void> {
    await this.emitEvent('products.deleted', {
      productId,
      product,
    });
  }

  // Campaign events
  async emitCampaignCreated(campaign: any): Promise<void> {
    await this.emitEvent('campaigns.created', { campaign });
  }

  async emitCampaignApproved(campaignId: string, campaign: any): Promise<void> {
    await this.emitEvent('campaigns.approved', {
      campaignId,
      campaign,
    });
  }

  async emitCampaignRejected(campaignId: string, reason: string, campaign: any): Promise<void> {
    await this.emitEvent('campaigns.rejected', {
      campaignId,
      reason,
      campaign,
    });
  }

  async emitCampaignPaused(campaignId: string, campaign: any): Promise<void> {
    await this.emitEvent('campaigns.paused', {
      campaignId,
      campaign,
    });
  }

  async emitCampaignResumed(campaignId: string, campaign: any): Promise<void> {
    await this.emitEvent('campaigns.resumed', {
      campaignId,
      campaign,
    });
  }

  // Feature flag events
  async emitFeatureFlagChanged(flagKey: string, oldValue: any, newValue: any): Promise<void> {
    await this.emitEvent('flags.changed', {
      flagKey,
      oldValue,
      newValue,
    });
  }

  async emitFeatureFlagRuleCreated(flagKey: string, rule: any): Promise<void> {
    await this.emitEvent('flags.rule.created', {
      flagKey,
      rule,
    });
  }

  async emitFeatureFlagRuleUpdated(flagKey: string, ruleId: string, rule: any): Promise<void> {
    await this.emitEvent('flags.rule.updated', {
      flagKey,
      ruleId,
      rule,
    });
  }

  async emitFeatureFlagRuleDeleted(flagKey: string, ruleId: string): Promise<void> {
    await this.emitEvent('flags.rule.deleted', {
      flagKey,
      ruleId,
    });
  }

  // User/Organization events
  async emitUserJoined(userId: string, organization: any): Promise<void> {
    await this.emitEvent('users.joined', {
      userId,
      organization,
    });
  }

  async emitUserLeft(userId: string, organization: any): Promise<void> {
    await this.emitEvent('users.left', {
      userId,
      organization,
    });
  }

  async emitOrganizationCreated(organization: any): Promise<void> {
    await this.emitEvent('organizations.created', { organization });
  }

  async emitOrganizationUpdated(organizationId: string, changes: any, organization: any): Promise<void> {
    await this.emitEvent('organizations.updated', {
      organizationId,
      changes,
      organization,
    });
  }

  // Subscription events
  async emitSubscriptionCreated(subscription: any): Promise<void> {
    await this.emitEvent('subscriptions.created', { subscription });
  }

  async emitSubscriptionUpdated(subscriptionId: string, changes: any, subscription: any): Promise<void> {
    await this.emitEvent('subscriptions.updated', {
      subscriptionId,
      changes,
      subscription,
    });
  }

  async emitSubscriptionCancelled(subscriptionId: string, subscription: any): Promise<void> {
    await this.emitEvent('subscriptions.cancelled', {
      subscriptionId,
      subscription,
    });
  }

  // Chat events
  async emitChatMessageCreated(message: any): Promise<void> {
    await this.emitEvent('chat.messages.created', { message });
  }

  async emitChatRoomCreated(room: any): Promise<void> {
    await this.emitEvent('chat.rooms.created', { room });
  }

  // Inventory events
  async emitInventoryUpdated(inventoryId: string, changes: any, inventory: any): Promise<void> {
    await this.emitEvent('inventory.updated', {
      inventoryId,
      changes,
      inventory,
    });
  }

  async emitLowStockAlert(productId: string, inventory: any): Promise<void> {
    await this.emitEvent('inventory.low_stock', {
      productId,
      inventory,
    });
  }

  // Analytics events
  async emitAnalyticsEvent(eventType: string, data: any): Promise<void> {
    await this.emitEvent(`analytics.${eventType}`, data);
  }

  // Audit events
  async emitAuditEvent(action: string, entity: string, entityId: string, details: any): Promise<void> {
    await this.emitEvent('audit.logged', {
      action,
      entity,
      entityId,
      details,
    });
  }

  // Notification events
  async emitNotificationSent(userId: string, type: string, data: any): Promise<void> {
    await this.emitEvent('notifications.sent', {
      userId,
      type,
      data,
    });
  }

  // Error events
  async emitErrorOccurred(error: Error, context: any): Promise<void> {
    await this.emitEvent('errors.occurred', {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    });
  }

  // Custom event emitter
  async emitCustomEvent(eventType: string, data: any): Promise<void> {
    await this.emitEvent(`custom.${eventType}`, data);
  }
}

// Tenant-aware RPC service
@Injectable()
export class TenantAwareRpcService {
  constructor(private client: ClientProxy) {}

  private tenantContext?: TenantContext;

  setTenantContext(context: TenantContext) {
    this.tenantContext = context;
  }

  private getClientId(): string {
    if (!this.tenantContext?.clientId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.clientId;
  }

  // Send RPC request with tenant context
  async sendRpc<T>(pattern: string, data: any): Promise<T> {
    const requestData = {
      ...data,
      tenant: {
        clientId: this.getClientId(),
        userId: this.tenantContext?.userId,
        role: this.tenantContext?.role,
        orgType: this.tenantContext?.orgType,
        isImpersonated: this.tenantContext?.isImpersonated,
        impersonatedBy: this.tenantContext?.impersonatedBy,
      },
    };

    return this.client.send(pattern, requestData).toPromise();
  }

  // Common RPC patterns
  async validateProduct(productId: string): Promise<any> {
    return this.sendRpc('products.validate', { productId });
  }

  async calculateOrderTotal(orderData: any): Promise<any> {
    return this.sendRpc('orders.calculate_total', orderData);
  }

  async checkInventory(productId: string, quantity: number): Promise<any> {
    return this.sendRpc('inventory.check', { productId, quantity });
  }

  async processPayment(paymentData: any): Promise<any> {
    return this.sendRpc('payments.process', paymentData);
  }

  async sendEmail(emailData: any): Promise<any> {
    return this.sendRpc('notifications.email', emailData);
  }

  async generateReport(reportType: string, params: any): Promise<any> {
    return this.sendRpc('reports.generate', { reportType, params });
  }
}
