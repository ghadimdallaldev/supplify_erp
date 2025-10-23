import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { addDays } from 'date-fns';
import {
  Entitlements,
  mergeEntitlements,
  validateEntitlements,
  validateOverrides,
} from '@supplify/entitlements';

/**
 * Subscriptions Service
 * Manages subscription plans and org subscriptions with Redis caching
 */
@Injectable()
export class SubscriptionsService {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get cache key for entitlements
   */
  private getCacheKey(orgType: string, orgId: string): string {
    return `entitlements:v1:${orgType}:${orgId}`;
  }

  /**
   * Invalidate entitlements cache for an org
   */
  private async invalidateCache(orgType: string, orgId: string): Promise<void> {
    const key = this.getCacheKey(orgType, orgId);
    await this.redis.del(key);
  }

  /**
   * Get all subscription plans
   */
  async getPlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  /**
   * Get a subscription plan by code
   */
  async getPlanByCode(code: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { code },
    });

    if (!plan) {
      throw new NotFoundException(`Plan ${code} not found`);
    }

    return plan;
  }

  /**
   * Get org subscription
   */
  async getOrgSubscription(orgId: string, orgType: string) {
    const subscription = await this.prisma.orgSubscription.findUnique({
      where: {
        orgId_orgType: {
          orgId,
          orgType,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(`No subscription found for ${orgType}:${orgId}`);
    }

    return subscription;
  }

  /**
   * Get resolved entitlements for an org (with caching)
   */
  async getEntitlements(orgId: string, orgType: string): Promise<Entitlements> {
    // Try cache first
    const cacheKey = this.getCacheKey(orgType, orgId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - fetch from DB
    const subscription = await this.getOrgSubscription(orgId, orgType);
    const plan = await this.getPlanByCode(subscription.planCode);

    // Merge plan entitlements with org overrides
    const baseEntitlements = plan.entitlements as Entitlements;
    const overrides = subscription.overrides as Partial<Entitlements> | undefined;
    const resolved = mergeEntitlements(baseEntitlements, overrides);

    // Validate resolved entitlements
    validateEntitlements(resolved);

    // Cache for 6 hours
    await this.redis.setex(cacheKey, 21600, JSON.stringify(resolved));

    return resolved;
  }

  /**
   * Assign subscription to an org (admin only)
   */
  async assignSubscription(data: {
    orgId: string;
    orgType: string;
    planCode: string;
    trialDays?: number;
    overrides?: any;
    assignedBy: string;
  }) {
    // Get plan
    const plan = await this.getPlanByCode(data.planCode);

    // Validate overrides if provided
    if (data.overrides) {
      validateOverrides(data.overrides);
    }

    // Calculate trial end date
    let trialEndsAt: Date | null = null;
    if (data.trialDays && data.trialDays > 0) {
      trialEndsAt = addDays(new Date(), data.trialDays);
    }

    // Check if subscription already exists
    const existing = await this.prisma.orgSubscription.findUnique({
      where: {
        orgId_orgType: {
          orgId: data.orgId,
          orgType: data.orgType,
        },
      },
    });

    let subscription;

    if (existing) {
      // Update existing subscription
      subscription = await this.prisma.orgSubscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          planCode: plan.code,
          status: 'ACTIVE',
          trialEndsAt,
          overrides: data.overrides,
          updatedBy: data.assignedBy,
        },
      });

      // Log event
      await this.prisma.subscriptionEvent.create({
        data: {
          orgId: data.orgId,
          orgType: data.orgType,
          eventType: 'UPDATED',
          previousPlan: existing.planCode,
          newPlan: plan.code,
          previousStatus: existing.status,
          newStatus: 'ACTIVE',
          changedBy: data.assignedBy,
          metadata: { trialDays: data.trialDays, hasOverrides: !!data.overrides },
        },
      });
    } else {
      // Create new subscription
      subscription = await this.prisma.orgSubscription.create({
        data: {
          orgId: data.orgId,
          orgType: data.orgType,
          planId: plan.id,
          planCode: plan.code,
          status: 'ACTIVE',
          startsAt: new Date(),
          trialEndsAt,
          overrides: data.overrides,
          updatedBy: data.assignedBy,
        },
      });

      // Log event
      await this.prisma.subscriptionEvent.create({
        data: {
          orgId: data.orgId,
          orgType: data.orgType,
          eventType: 'ASSIGNED',
          newPlan: plan.code,
          newStatus: 'ACTIVE',
          changedBy: data.assignedBy,
          metadata: { trialDays: data.trialDays, hasOverrides: !!data.overrides },
        },
      });
    }

    // Invalidate cache
    await this.invalidateCache(data.orgType, data.orgId);

    return subscription;
  }

  /**
   * Update subscription (admin only)
   */
  async updateSubscription(data: {
    subscriptionId: string;
    status?: string;
    planCode?: string;
    endsAt?: Date;
    overrides?: any;
    updatedBy: string;
  }) {
    const existing = await this.prisma.orgSubscription.findUnique({
      where: { id: data.subscriptionId },
    });

    if (!existing) {
      throw new NotFoundException('Subscription not found');
    }

    // Validate overrides if provided
    if (data.overrides) {
      validateOverrides(data.overrides);
    }

    // If changing plan, validate it exists
    let planId = existing.planId;
    if (data.planCode && data.planCode !== existing.planCode) {
      const plan = await this.getPlanByCode(data.planCode);
      planId = plan.id;
    }

    // Update subscription
    const updated = await this.prisma.orgSubscription.update({
      where: { id: data.subscriptionId },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.planCode && { planId, planCode: data.planCode }),
        ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
        ...(data.overrides && { overrides: data.overrides }),
        updatedBy: data.updatedBy,
      },
    });

    // Log event
    await this.prisma.subscriptionEvent.create({
      data: {
        orgId: existing.orgId,
        orgType: existing.orgType,
        eventType: 'UPDATED',
        previousPlan: existing.planCode,
        newPlan: updated.planCode,
        previousStatus: existing.status,
        newStatus: updated.status,
        changedBy: data.updatedBy,
        metadata: {
          subscriptionId: data.subscriptionId,
          changes: Object.keys(data).filter(k => k !== 'subscriptionId' && k !== 'updatedBy'),
        },
      },
    });

    // Invalidate cache
    await this.invalidateCache(existing.orgType, existing.orgId);

    return updated;
  }

  /**
   * Get subscription events for an org (audit trail)
   */
  async getSubscriptionEvents(orgId: string, orgType: string, limit = 50) {
    return this.prisma.subscriptionEvent.findMany({
      where: {
        orgId,
        orgType,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Get all org subscriptions (for admin dashboard)
   */
  async getAllSubscriptions(filters?: {
    orgType?: string;
    planCode?: string;
    status?: string;
  }) {
    return this.prisma.orgSubscription.findMany({
      where: {
        ...(filters?.orgType && { orgType: filters.orgType }),
        ...(filters?.planCode && { planCode: filters.planCode }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get subscription statistics (for admin dashboard)
   */
  async getSubscriptionStats() {
    const [
      totalSubscriptions,
      activeSubscriptions,
      byPlan,
      byOrgType,
      trialsEnding Soon,
    ] = await Promise.all([
      this.prisma.orgSubscription.count(),
      this.prisma.orgSubscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.orgSubscription.groupBy({
        by: ['planCode'],
        _count: true,
      }),
      this.prisma.orgSubscription.groupBy({
        by: ['orgType'],
        _count: true,
      }),
      this.prisma.orgSubscription.count({
        where: {
          trialEndsAt: {
            gte: new Date(),
            lte: addDays(new Date(), 7),
          },
        },
      }),
    ]);

    return {
      totalSubscriptions,
      activeSubscriptions,
      byPlan: byPlan.reduce((acc, item) => {
        acc[item.planCode] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byOrgType: byOrgType.reduce((acc, item) => {
        acc[item.orgType] = item._count;
        return acc;
      }, {} as Record<string, number>),
      trialsEndingSoon,
    };
  }
}

