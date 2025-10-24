"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantAwareRpcService = exports.TenantAwareEventService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
let TenantAwareEventService = class TenantAwareEventService {
    client;
    constructor(client) {
        this.client = client;
    }
    tenantContext;
    setTenantContext(context) {
        this.tenantContext = context;
    }
    getClientId() {
        if (!this.tenantContext?.clientId) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.clientId;
    }
    // Generate tenant-scoped routing key
    getTenantRoutingKey(baseKey) {
        return `tenant.${this.getClientId()}.${baseKey}`;
    }
    // Emit tenant-scoped events
    async emitEvent(pattern, data) {
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
    async emitOrderCreated(order) {
        await this.emitEvent('orders.created', { order });
    }
    async emitOrderStatusChanged(orderId, from, to, order) {
        await this.emitEvent('orders.status.changed', {
            orderId,
            from,
            to,
            order,
        });
    }
    async emitOrderDelivered(orderId, order) {
        await this.emitEvent('orders.delivered', {
            orderId,
            order,
        });
    }
    async emitOrderCancelled(orderId, reason, order) {
        await this.emitEvent('orders.cancelled', {
            orderId,
            reason,
            order,
        });
    }
    // Product events
    async emitProductCreated(product) {
        await this.emitEvent('products.created', { product });
    }
    async emitProductUpdated(productId, changes, product) {
        await this.emitEvent('products.updated', {
            productId,
            changes,
            product,
        });
    }
    async emitProductDeleted(productId, product) {
        await this.emitEvent('products.deleted', {
            productId,
            product,
        });
    }
    // Campaign events
    async emitCampaignCreated(campaign) {
        await this.emitEvent('campaigns.created', { campaign });
    }
    async emitCampaignApproved(campaignId, campaign) {
        await this.emitEvent('campaigns.approved', {
            campaignId,
            campaign,
        });
    }
    async emitCampaignRejected(campaignId, reason, campaign) {
        await this.emitEvent('campaigns.rejected', {
            campaignId,
            reason,
            campaign,
        });
    }
    async emitCampaignPaused(campaignId, campaign) {
        await this.emitEvent('campaigns.paused', {
            campaignId,
            campaign,
        });
    }
    async emitCampaignResumed(campaignId, campaign) {
        await this.emitEvent('campaigns.resumed', {
            campaignId,
            campaign,
        });
    }
    // Feature flag events
    async emitFeatureFlagChanged(flagKey, oldValue, newValue) {
        await this.emitEvent('flags.changed', {
            flagKey,
            oldValue,
            newValue,
        });
    }
    async emitFeatureFlagRuleCreated(flagKey, rule) {
        await this.emitEvent('flags.rule.created', {
            flagKey,
            rule,
        });
    }
    async emitFeatureFlagRuleUpdated(flagKey, ruleId, rule) {
        await this.emitEvent('flags.rule.updated', {
            flagKey,
            ruleId,
            rule,
        });
    }
    async emitFeatureFlagRuleDeleted(flagKey, ruleId) {
        await this.emitEvent('flags.rule.deleted', {
            flagKey,
            ruleId,
        });
    }
    // User/Organization events
    async emitUserJoined(userId, organization) {
        await this.emitEvent('users.joined', {
            userId,
            organization,
        });
    }
    async emitUserLeft(userId, organization) {
        await this.emitEvent('users.left', {
            userId,
            organization,
        });
    }
    async emitOrganizationCreated(organization) {
        await this.emitEvent('organizations.created', { organization });
    }
    async emitOrganizationUpdated(organizationId, changes, organization) {
        await this.emitEvent('organizations.updated', {
            organizationId,
            changes,
            organization,
        });
    }
    // Subscription events
    async emitSubscriptionCreated(subscription) {
        await this.emitEvent('subscriptions.created', { subscription });
    }
    async emitSubscriptionUpdated(subscriptionId, changes, subscription) {
        await this.emitEvent('subscriptions.updated', {
            subscriptionId,
            changes,
            subscription,
        });
    }
    async emitSubscriptionCancelled(subscriptionId, subscription) {
        await this.emitEvent('subscriptions.cancelled', {
            subscriptionId,
            subscription,
        });
    }
    // Chat events
    async emitChatMessageCreated(message) {
        await this.emitEvent('chat.messages.created', { message });
    }
    async emitChatRoomCreated(room) {
        await this.emitEvent('chat.rooms.created', { room });
    }
    // Inventory events
    async emitInventoryUpdated(inventoryId, changes, inventory) {
        await this.emitEvent('inventory.updated', {
            inventoryId,
            changes,
            inventory,
        });
    }
    async emitLowStockAlert(productId, inventory) {
        await this.emitEvent('inventory.low_stock', {
            productId,
            inventory,
        });
    }
    // Analytics events
    async emitAnalyticsEvent(eventType, data) {
        await this.emitEvent(`analytics.${eventType}`, data);
    }
    // Audit events
    async emitAuditEvent(action, entity, entityId, details) {
        await this.emitEvent('audit.logged', {
            action,
            entity,
            entityId,
            details,
        });
    }
    // Notification events
    async emitNotificationSent(userId, type, data) {
        await this.emitEvent('notifications.sent', {
            userId,
            type,
            data,
        });
    }
    // Error events
    async emitErrorOccurred(error, context) {
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
    async emitCustomEvent(eventType, data) {
        await this.emitEvent(`custom.${eventType}`, data);
    }
};
exports.TenantAwareEventService = TenantAwareEventService;
exports.TenantAwareEventService = TenantAwareEventService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [microservices_1.ClientProxy])
], TenantAwareEventService);
// Tenant-aware RPC service
let TenantAwareRpcService = class TenantAwareRpcService {
    client;
    constructor(client) {
        this.client = client;
    }
    tenantContext;
    setTenantContext(context) {
        this.tenantContext = context;
    }
    getClientId() {
        if (!this.tenantContext?.clientId) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.clientId;
    }
    // Send RPC request with tenant context
    async sendRpc(pattern, data) {
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
    async validateProduct(productId) {
        return this.sendRpc('products.validate', { productId });
    }
    async calculateOrderTotal(orderData) {
        return this.sendRpc('orders.calculate_total', orderData);
    }
    async checkInventory(productId, quantity) {
        return this.sendRpc('inventory.check', { productId, quantity });
    }
    async processPayment(paymentData) {
        return this.sendRpc('payments.process', paymentData);
    }
    async sendEmail(emailData) {
        return this.sendRpc('notifications.email', emailData);
    }
    async generateReport(reportType, params) {
        return this.sendRpc('reports.generate', { reportType, params });
    }
};
exports.TenantAwareRpcService = TenantAwareRpcService;
exports.TenantAwareRpcService = TenantAwareRpcService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [microservices_1.ClientProxy])
], TenantAwareRpcService);
//# sourceMappingURL=tenant-events.js.map