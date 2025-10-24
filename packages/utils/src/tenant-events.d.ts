import { ClientProxy } from '@nestjs/microservices';
import { TenantContext } from '@supplify/utils';
export declare class TenantAwareEventService {
    private client;
    constructor(client: ClientProxy);
    private tenantContext?;
    setTenantContext(context: TenantContext): void;
    private getClientId;
    private getTenantRoutingKey;
    emitEvent(pattern: string, data: any): Promise<void>;
    emitOrderCreated(order: any): Promise<void>;
    emitOrderStatusChanged(orderId: string, from: string, to: string, order: any): Promise<void>;
    emitOrderDelivered(orderId: string, order: any): Promise<void>;
    emitOrderCancelled(orderId: string, reason: string, order: any): Promise<void>;
    emitProductCreated(product: any): Promise<void>;
    emitProductUpdated(productId: string, changes: any, product: any): Promise<void>;
    emitProductDeleted(productId: string, product: any): Promise<void>;
    emitCampaignCreated(campaign: any): Promise<void>;
    emitCampaignApproved(campaignId: string, campaign: any): Promise<void>;
    emitCampaignRejected(campaignId: string, reason: string, campaign: any): Promise<void>;
    emitCampaignPaused(campaignId: string, campaign: any): Promise<void>;
    emitCampaignResumed(campaignId: string, campaign: any): Promise<void>;
    emitFeatureFlagChanged(flagKey: string, oldValue: any, newValue: any): Promise<void>;
    emitFeatureFlagRuleCreated(flagKey: string, rule: any): Promise<void>;
    emitFeatureFlagRuleUpdated(flagKey: string, ruleId: string, rule: any): Promise<void>;
    emitFeatureFlagRuleDeleted(flagKey: string, ruleId: string): Promise<void>;
    emitUserJoined(userId: string, organization: any): Promise<void>;
    emitUserLeft(userId: string, organization: any): Promise<void>;
    emitOrganizationCreated(organization: any): Promise<void>;
    emitOrganizationUpdated(organizationId: string, changes: any, organization: any): Promise<void>;
    emitSubscriptionCreated(subscription: any): Promise<void>;
    emitSubscriptionUpdated(subscriptionId: string, changes: any, subscription: any): Promise<void>;
    emitSubscriptionCancelled(subscriptionId: string, subscription: any): Promise<void>;
    emitChatMessageCreated(message: any): Promise<void>;
    emitChatRoomCreated(room: any): Promise<void>;
    emitInventoryUpdated(inventoryId: string, changes: any, inventory: any): Promise<void>;
    emitLowStockAlert(productId: string, inventory: any): Promise<void>;
    emitAnalyticsEvent(eventType: string, data: any): Promise<void>;
    emitAuditEvent(action: string, entity: string, entityId: string, details: any): Promise<void>;
    emitNotificationSent(userId: string, type: string, data: any): Promise<void>;
    emitErrorOccurred(error: Error, context: any): Promise<void>;
    emitCustomEvent(eventType: string, data: any): Promise<void>;
}
export declare class TenantAwareRpcService {
    private client;
    constructor(client: ClientProxy);
    private tenantContext?;
    setTenantContext(context: TenantContext): void;
    private getClientId;
    sendRpc<T>(pattern: string, data: any): Promise<T>;
    validateProduct(productId: string): Promise<any>;
    calculateOrderTotal(orderData: any): Promise<any>;
    checkInventory(productId: string, quantity: number): Promise<any>;
    processPayment(paymentData: any): Promise<any>;
    sendEmail(emailData: any): Promise<any>;
    generateReport(reportType: string, params: any): Promise<any>;
}
//# sourceMappingURL=tenant-events.d.ts.map