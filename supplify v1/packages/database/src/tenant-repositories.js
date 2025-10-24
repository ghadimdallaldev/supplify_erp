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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantOrganizationRepository = exports.TenantCampaignRepository = exports.TenantOrderRepository = exports.TenantProductRepository = exports.TenantAwareRepository = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
let TenantAwareRepository = class TenantAwareRepository {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
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
    getUserId() {
        if (!this.tenantContext?.userId) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.userId;
    }
    getRole() {
        if (!this.tenantContext?.role) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.role;
    }
    getOrgType() {
        if (!this.tenantContext?.orgType) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.orgType;
    }
    // Helper method to ensure tenant scoping
    ensureTenantScope(data) {
        const clientId = this.getClientId();
        return {
            ...data,
            clientId,
        };
    }
    // Helper method for tenant-scoped queries
    addTenantFilter(where = {}) {
        return {
            ...where,
            clientId: this.getClientId(),
        };
    }
    // Helper method for tenant-scoped creates
    addTenantData(data) {
        return {
            ...data,
            clientId: this.getClientId(),
        };
    }
    // Audit logging helper
    async logAudit(action, entity, entityId, before, after) {
        if (!this.tenantContext)
            return;
        await this.prisma.auditLog.create({
            data: {
                clientId: this.tenantContext.clientId,
                userId: this.tenantContext.userId,
                action,
                entity,
                entityId,
                before: before ? JSON.stringify(before) : null,
                after: after ? JSON.stringify(after) : null,
                metadata: {
                    role: this.tenantContext.role,
                    orgType: this.tenantContext.orgType,
                    isImpersonated: this.tenantContext.isImpersonated,
                    impersonatedBy: this.tenantContext.impersonatedBy,
                },
            },
        });
    }
};
exports.TenantAwareRepository = TenantAwareRepository;
exports.TenantAwareRepository = TenantAwareRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], TenantAwareRepository);
// Tenant-scoped Product Repository
let TenantProductRepository = class TenantProductRepository extends TenantAwareRepository {
    async findMany(where = {}) {
        return this.prisma.product.findMany({
            where: this.addTenantFilter(where),
        });
    }
    async findUnique(where) {
        return this.prisma.product.findFirst({
            where: this.addTenantFilter(where),
        });
    }
    async create(data) {
        const productData = this.addTenantData(data);
        const product = await this.prisma.product.create({
            data: productData,
        });
        await this.logAudit('CREATE', 'Product', product.id, null, product);
        return product;
    }
    async update(where, data) {
        const tenantWhere = this.addTenantFilter(where);
        const before = await this.prisma.product.findFirst({ where: tenantWhere });
        const product = await this.prisma.product.update({
            where: tenantWhere,
            data: this.addTenantData(data),
        });
        await this.logAudit('UPDATE', 'Product', product.id, before, product);
        return product;
    }
    async delete(where) {
        const tenantWhere = this.addTenantFilter(where);
        const before = await this.prisma.product.findFirst({ where: tenantWhere });
        const product = await this.prisma.product.delete({
            where: tenantWhere,
        });
        await this.logAudit('DELETE', 'Product', product.id, before, null);
        return product;
    }
};
exports.TenantProductRepository = TenantProductRepository;
exports.TenantProductRepository = TenantProductRepository = __decorate([
    (0, common_1.Injectable)()
], TenantProductRepository);
// Tenant-scoped Order Repository
let TenantOrderRepository = class TenantOrderRepository extends TenantAwareRepository {
    async findMany(where = {}) {
        return this.prisma.order.findMany({
            where: this.addTenantFilter(where),
            include: {
                items: true,
                events: true,
                messages: true,
            },
        });
    }
    async findUnique(where) {
        return this.prisma.order.findFirst({
            where: this.addTenantFilter(where),
            include: {
                items: true,
                events: true,
                messages: true,
            },
        });
    }
    async create(data) {
        const orderData = this.addTenantData(data);
        const order = await this.prisma.order.create({
            data: {
                ...orderData,
                items: {
                    create: orderData.items?.map((item) => ({
                        ...item,
                        clientId: this.getClientId(),
                    })) || [],
                },
            },
            include: {
                items: true,
            },
        });
        await this.logAudit('CREATE', 'Order', order.id, null, order);
        return order;
    }
    async update(where, data) {
        const tenantWhere = this.addTenantFilter(where);
        const before = await this.prisma.order.findFirst({ where: tenantWhere });
        const order = await this.prisma.order.update({
            where: tenantWhere,
            data: this.addTenantData(data),
            include: {
                items: true,
                events: true,
            },
        });
        await this.logAudit('UPDATE', 'Order', order.id, before, order);
        return order;
    }
    async addEvent(orderId, eventData) {
        const event = await this.prisma.orderEvent.create({
            data: {
                ...eventData,
                orderId,
                clientId: this.getClientId(),
            },
        });
        await this.logAudit('CREATE', 'OrderEvent', event.id, null, event);
        return event;
    }
    async addMessage(orderId, messageData) {
        const message = await this.prisma.orderMessage.create({
            data: {
                ...messageData,
                orderId,
                clientId: this.getClientId(),
            },
        });
        await this.logAudit('CREATE', 'OrderMessage', message.id, null, message);
        return message;
    }
};
exports.TenantOrderRepository = TenantOrderRepository;
exports.TenantOrderRepository = TenantOrderRepository = __decorate([
    (0, common_1.Injectable)()
], TenantOrderRepository);
// Tenant-scoped Campaign Repository
let TenantCampaignRepository = class TenantCampaignRepository extends TenantAwareRepository {
    async findMany(where = {}) {
        return this.prisma.campaign.findMany({
            where: this.addTenantFilter(where),
            include: {
                stats: true,
                impressions: true,
                clicks: true,
            },
        });
    }
    async findUnique(where) {
        return this.prisma.campaign.findFirst({
            where: this.addTenantFilter(where),
            include: {
                stats: true,
                impressions: true,
                clicks: true,
            },
        });
    }
    async create(data) {
        const campaignData = this.addTenantData(data);
        const campaign = await this.prisma.campaign.create({
            data: campaignData,
        });
        await this.logAudit('CREATE', 'Campaign', campaign.id, null, campaign);
        return campaign;
    }
    async update(where, data) {
        const tenantWhere = this.addTenantFilter(where);
        const before = await this.prisma.campaign.findFirst({ where: tenantWhere });
        const campaign = await this.prisma.campaign.update({
            where: tenantWhere,
            data: this.addTenantData(data),
        });
        await this.logAudit('UPDATE', 'Campaign', campaign.id, before, campaign);
        return campaign;
    }
    async approve(campaignId, approvedBy) {
        const tenantWhere = this.addTenantFilter({ id: campaignId });
        const before = await this.prisma.campaign.findFirst({ where: tenantWhere });
        const campaign = await this.prisma.campaign.update({
            where: tenantWhere,
            data: {
                status: 'APPROVED',
                approvedAt: new Date(),
                approvedBy,
            },
        });
        await this.logAudit('APPROVE', 'Campaign', campaign.id, before, campaign);
        return campaign;
    }
    async logImpression(campaignId, impressionData) {
        return this.prisma.impressionLog.create({
            data: {
                ...impressionData,
                campaignId,
                clientId: this.getClientId(),
            },
        });
    }
    async logClick(campaignId, clickData) {
        return this.prisma.clickLog.create({
            data: {
                ...clickData,
                campaignId,
                clientId: this.getClientId(),
            },
        });
    }
};
exports.TenantCampaignRepository = TenantCampaignRepository;
exports.TenantCampaignRepository = TenantCampaignRepository = __decorate([
    (0, common_1.Injectable)()
], TenantCampaignRepository);
// Tenant-scoped Organization Repository
let TenantOrganizationRepository = class TenantOrganizationRepository extends TenantAwareRepository {
    async findMany(where = {}) {
        return this.prisma.organization.findMany({
            where: this.addTenantFilter(where),
            include: {
                memberships: {
                    include: {
                        user: true,
                    },
                },
                subscriptions: true,
            },
        });
    }
    async findUnique(where) {
        return this.prisma.organization.findFirst({
            where: this.addTenantFilter(where),
            include: {
                memberships: {
                    include: {
                        user: true,
                    },
                },
                subscriptions: true,
            },
        });
    }
    async create(data) {
        const orgData = this.addTenantData(data);
        const organization = await this.prisma.organization.create({
            data: orgData,
        });
        await this.logAudit('CREATE', 'Organization', organization.id, null, organization);
        return organization;
    }
    async update(where, data) {
        const tenantWhere = this.addTenantFilter(where);
        const before = await this.prisma.organization.findFirst({ where: tenantWhere });
        const organization = await this.prisma.organization.update({
            where: tenantWhere,
            data: this.addTenantData(data),
        });
        await this.logAudit('UPDATE', 'Organization', organization.id, before, organization);
        return organization;
    }
    async addMember(userId, role = 'MEMBER') {
        const membership = await this.prisma.membership.create({
            data: {
                userId,
                clientId: this.getClientId(),
                role,
                status: 'ACTIVE',
            },
        });
        await this.logAudit('CREATE', 'Membership', membership.id, null, membership);
        return membership;
    }
    async removeMember(userId) {
        const membership = await this.prisma.membership.findFirst({
            where: {
                userId,
                clientId: this.getClientId(),
            },
        });
        if (membership) {
            await this.prisma.membership.delete({
                where: { id: membership.id },
            });
            await this.logAudit('DELETE', 'Membership', membership.id, membership, null);
        }
    }
};
exports.TenantOrganizationRepository = TenantOrganizationRepository;
exports.TenantOrganizationRepository = TenantOrganizationRepository = __decorate([
    (0, common_1.Injectable)()
], TenantOrganizationRepository);
//# sourceMappingURL=tenant-repositories.js.map