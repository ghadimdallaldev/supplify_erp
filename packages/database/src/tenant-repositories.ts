import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantContext } from '@supplify/utils';

@Injectable()
export abstract class TenantAwareRepository {
  constructor(protected prisma: PrismaService) {}

  protected tenantContext?: TenantContext;

  setTenantContext(context: TenantContext) {
    this.tenantContext = context;
  }

  protected getClientId(): string {
    if (!this.tenantContext?.clientId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.clientId;
  }

  protected getUserId(): string {
    if (!this.tenantContext?.userId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.userId;
  }

  protected getRole(): string {
    if (!this.tenantContext?.role) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.role;
  }

  protected getOrgType(): string {
    if (!this.tenantContext?.orgType) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.orgType;
  }

  // Helper method to ensure tenant scoping
  protected ensureTenantScope<T extends { clientId: string }>(data: Partial<T>): T {
    const clientId = this.getClientId();
    return {
      ...data,
      clientId,
    } as T;
  }

  // Helper method for tenant-scoped queries
  protected addTenantFilter<T extends { clientId: string }>(where: Partial<T> = {}): Partial<T> {
    return {
      ...where,
      clientId: this.getClientId(),
    };
  }

  // Helper method for tenant-scoped creates
  protected addTenantData<T extends { clientId: string }>(data: Omit<T, 'clientId'>): T {
    return {
      ...data,
      clientId: this.getClientId(),
    } as T;
  }

  // Audit logging helper
  protected async logAudit(action: string, entity: string, entityId?: string, before?: any, after?: any) {
    if (!this.tenantContext) return;

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
}

// Tenant-scoped Product Repository
@Injectable()
export class TenantProductRepository extends TenantAwareRepository {
  async findMany(where: any = {}) {
    return this.prisma.product.findMany({
      where: this.addTenantFilter(where),
    });
  }

  async findUnique(where: any) {
    return this.prisma.product.findFirst({
      where: this.addTenantFilter(where),
    });
  }

  async create(data: any) {
    const productData = this.addTenantData(data);
    const product = await this.prisma.product.create({
      data: productData,
    });

    await this.logAudit('CREATE', 'Product', product.id, null, product);
    return product;
  }

  async update(where: any, data: any) {
    const tenantWhere = this.addTenantFilter(where);
    const before = await this.prisma.product.findFirst({ where: tenantWhere });
    
    const product = await this.prisma.product.update({
      where: tenantWhere,
      data: this.addTenantData(data),
    });

    await this.logAudit('UPDATE', 'Product', product.id, before, product);
    return product;
  }

  async delete(where: any) {
    const tenantWhere = this.addTenantFilter(where);
    const before = await this.prisma.product.findFirst({ where: tenantWhere });
    
    const product = await this.prisma.product.delete({
      where: tenantWhere,
    });

    await this.logAudit('DELETE', 'Product', product.id, before, null);
    return product;
  }
}

// Tenant-scoped Order Repository
@Injectable()
export class TenantOrderRepository extends TenantAwareRepository {
  async findMany(where: any = {}) {
    return this.prisma.order.findMany({
      where: this.addTenantFilter(where),
      include: {
        items: true,
        events: true,
        messages: true,
      },
    });
  }

  async findUnique(where: any) {
    return this.prisma.order.findFirst({
      where: this.addTenantFilter(where),
      include: {
        items: true,
        events: true,
        messages: true,
      },
    });
  }

  async create(data: any) {
    const orderData = this.addTenantData(data);
    const order = await this.prisma.order.create({
      data: {
        ...orderData,
        items: {
          create: orderData.items?.map((item: any) => ({
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

  async update(where: any, data: any) {
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

  async addEvent(orderId: string, eventData: any) {
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

  async addMessage(orderId: string, messageData: any) {
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
}

// Tenant-scoped Campaign Repository
@Injectable()
export class TenantCampaignRepository extends TenantAwareRepository {
  async findMany(where: any = {}) {
    return this.prisma.campaign.findMany({
      where: this.addTenantFilter(where),
      include: {
        stats: true,
        impressions: true,
        clicks: true,
      },
    });
  }

  async findUnique(where: any) {
    return this.prisma.campaign.findFirst({
      where: this.addTenantFilter(where),
      include: {
        stats: true,
        impressions: true,
        clicks: true,
      },
    });
  }

  async create(data: any) {
    const campaignData = this.addTenantData(data);
    const campaign = await this.prisma.campaign.create({
      data: campaignData,
    });

    await this.logAudit('CREATE', 'Campaign', campaign.id, null, campaign);
    return campaign;
  }

  async update(where: any, data: any) {
    const tenantWhere = this.addTenantFilter(where);
    const before = await this.prisma.campaign.findFirst({ where: tenantWhere });
    
    const campaign = await this.prisma.campaign.update({
      where: tenantWhere,
      data: this.addTenantData(data),
    });

    await this.logAudit('UPDATE', 'Campaign', campaign.id, before, campaign);
    return campaign;
  }

  async approve(campaignId: string, approvedBy: string) {
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

  async logImpression(campaignId: string, impressionData: any) {
    return this.prisma.impressionLog.create({
      data: {
        ...impressionData,
        campaignId,
        clientId: this.getClientId(),
      },
    });
  }

  async logClick(campaignId: string, clickData: any) {
    return this.prisma.clickLog.create({
      data: {
        ...clickData,
        campaignId,
        clientId: this.getClientId(),
      },
    });
  }
}

// Tenant-scoped Organization Repository
@Injectable()
export class TenantOrganizationRepository extends TenantAwareRepository {
  async findMany(where: any = {}) {
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

  async findUnique(where: any) {
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

  async create(data: any) {
    const orgData = this.addTenantData(data);
    const organization = await this.prisma.organization.create({
      data: orgData,
    });

    await this.logAudit('CREATE', 'Organization', organization.id, null, organization);
    return organization;
  }

  async update(where: any, data: any) {
    const tenantWhere = this.addTenantFilter(where);
    const before = await this.prisma.organization.findFirst({ where: tenantWhere });
    
    const organization = await this.prisma.organization.update({
      where: tenantWhere,
      data: this.addTenantData(data),
    });

    await this.logAudit('UPDATE', 'Organization', organization.id, before, organization);
    return organization;
  }

  async addMember(userId: string, role: string = 'MEMBER') {
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

  async removeMember(userId: string) {
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
}
