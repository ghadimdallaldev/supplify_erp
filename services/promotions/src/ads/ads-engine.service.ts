import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { Promotion, PromotionStatus, BillingModel } from '@prisma/client';

interface SponsoredResult {
  promotion: Promotion;
  productId: string;
  sponsoredScore: number;
  isSponsored: true;
  sponsorSupplierId: string;
  promotionId: string;
}

interface RankingFactors {
  priorityScore: number;
  ctr: number;
  bidFactor: number;
  tierWeight: number;
}

/**
 * Ads Serving Engine
 * Handles fetching, ranking, and serving sponsored content
 */
@Injectable()
export class AdsEngineService {
  private readonly logger = new Logger(AdsEngineService.name);
  private redis: Redis;

  // Tier weights for ranking boost
  private readonly TIER_WEIGHTS = {
    BASIC: 1.0,
    PRO: 1.05,    // +5% boost
    PREMIUM: 1.10, // +10% boost
  };

  constructor(private prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get cache key for active campaigns
   */
  private getCacheKey(supplierId?: string, categoryId?: string): string {
    if (supplierId) return `ads:v1:supplier:${supplierId}`;
    if (categoryId) return `ads:placement:v1:category:${categoryId}`;
    return 'ads:v1:active';
  }

  /**
   * Invalidate ads cache
   */
  async invalidateCache(supplierId?: string) {
    const keys = [`ads:v1:active`];
    if (supplierId) {
      keys.push(`ads:v1:supplier:${supplierId}`);
    }

    for (const key of keys) {
      await this.redis.del(key);
    }
  }

  /**
   * Fetch active campaigns with budget available
   */
  async getActiveCampaigns(filters?: {
    supplierId?: string;
    categoryId?: string;
    productId?: string;
  }): Promise<Promotion[]> {
    const now = new Date();

    const where: any = {
      status: PromotionStatus.ACTIVE,
      startDate: { lte: now },
      endDate: { gte: now },
      // Budget check: spent < total
      spentUSD: { lt: this.prisma.promotion.fields.totalBudgetUSD },
    };

    if (filters?.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters?.categoryId || filters?.productId) {
      // Filter by target IDs if targeting specific items
      where.OR = [
        ...(filters.categoryId ? [{ targetIds: { has: filters.categoryId } }] : []),
        ...(filters.productId ? [{ targetIds: { has: filters.productId } }] : []),
      ];
    }

    return this.prisma.promotion.findMany({
      where,
      orderBy: [
        { isFeatured: 'desc' },
        { priorityScore: 'desc' },
      ],
    });
  }

  /**
   * Calculate sponsored score for ranking
   * Formula: priorityScore * CTR * bidFactor * tierWeight
   */
  calculateSponsoredScore(
    promotion: Promotion,
    tierCode: string = 'BASIC',
  ): number {
    const factors: RankingFactors = {
      priorityScore: promotion.priorityScore,
      ctr: promotion.ctr > 0 ? promotion.ctr : 0.01, // Default 1% if no data
      bidFactor: this.calculateBidFactor(promotion),
      tierWeight: this.TIER_WEIGHTS[tierCode as keyof typeof this.TIER_WEIGHTS] || 1.0,
    };

    const score = 
      factors.priorityScore *
      factors.ctr *
      factors.bidFactor *
      factors.tierWeight;

    return score;
  }

  /**
   * Calculate bid factor based on CPM/CPC
   */
  private calculateBidFactor(promotion: Promotion): number {
    // Normalize bid to a 0-2 range where 1.0 is baseline
    // Higher bids = higher factor
    const baselineCPM = 1.0;
    const baselineCPC = 0.1;

    if (promotion.billingModel === BillingModel.CPM) {
      return Math.min(2.0, promotion.cpmUSD / baselineCPM);
    } else if (promotion.billingModel === BillingModel.CPC && promotion.cpcUSD) {
      return Math.min(2.0, promotion.cpcUSD / baselineCPC);
    } else {
      // HYBRID: average both
      const cpmFactor = promotion.cpmUSD / baselineCPM;
      const cpcFactor = (promotion.cpcUSD || 0) / baselineCPC;
      return Math.min(2.0, (cpmFactor + cpcFactor) / 2);
    }
  }

  /**
   * Rank and blend sponsored results with organic results
   */
  async blendResults(
    organicResults: any[],
    options: {
      categoryId?: string;
      searchQuery?: string;
      supplierId?: string;
      maxSponsored?: number;
      restaurantId?: string;
    },
  ): Promise<any[]> {
    const maxSponsored = options.maxSponsored || 3;

    // Fetch active campaigns
    let campaigns = await this.getActiveCampaigns({
      categoryId: options.categoryId,
    });

    // Filter by keywords if search query provided
    if (options.searchQuery) {
      const queryLower = options.searchQuery.toLowerCase();
      campaigns = campaigns.filter(c =>
        c.keywords.some(k => queryLower.includes(k.toLowerCase())),
      );
    }

    // Calculate scores and rank
    const rankedCampaigns = campaigns
      .map(campaign => ({
        campaign,
        score: this.calculateSponsoredScore(campaign, 'PRO'), // TODO: Get actual tier
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSponsored);

    // Extract sponsored products
    const sponsoredResults: any[] = [];

    for (const { campaign } of rankedCampaigns) {
      // Get products from target IDs
      for (const productId of campaign.targetIds.slice(0, 3)) {
        // Max 3 products per campaign
        sponsoredResults.push({
          productId,
          isSponsored: true,
          sponsorSupplierId: campaign.supplierId,
          promotionId: campaign.id,
          sponsoredScore: this.calculateSponsoredScore(campaign),
        });
      }
    }

    // Blend: sponsored first, then organic (excluding duplicates)
    const sponsoredProductIds = new Set(sponsoredResults.map(r => r.productId));
    const organicFiltered = organicResults.filter(
      r => !sponsoredProductIds.has(r.id || r.productId),
    );

    return [...sponsoredResults, ...organicFiltered];
  }

  /**
   * Log impression and deduct cost
   */
  async logImpression(
    promotionId: string,
    restaurantId: string,
    productId: string,
  ): Promise<void> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion || promotion.status !== PromotionStatus.ACTIVE) {
      return;
    }

    // Calculate cost (CPM = cost per 1000 impressions)
    const costPerImpression = promotion.cpmUSD / 1000;

    // Check if daily budget exceeded
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todaySpend = await this.prisma.promotionEvent.aggregate({
      where: {
        promotionId,
        eventType: 'IMPRESSION',
        createdAt: { gte: today },
      },
      _sum: { costUSD: true },
    });

    const dailySpent = todaySpend._sum.costUSD || 0;

    if (dailySpent + costPerImpression > promotion.dailyBudgetUSD) {
      this.logger.warn(`Daily budget exceeded for promotion ${promotionId}`);
      return;
    }

    // Log event and update spend
    await this.prisma.$transaction([
      this.prisma.promotionEvent.create({
        data: {
          promotionId,
          eventType: 'IMPRESSION',
          restaurantId,
          productId,
          costUSD: costPerImpression,
        },
      }),
      this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          spentUSD: { increment: costPerImpression },
          impressions: { increment: 1 },
        },
      }),
    ]);

    // Check if total budget exhausted
    const updated = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (updated && updated.spentUSD >= updated.totalBudgetUSD) {
      await this.pauseCampaign(promotionId, 'BUDGET_EXHAUSTED');
    }

    // Update CTR
    await this.updateCTR(promotionId);
  }

  /**
   * Log click and deduct cost (if CPC model)
   */
  async logClick(
    promotionId: string,
    restaurantId: string,
    productId: string,
  ): Promise<void> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promotion || promotion.status !== PromotionStatus.ACTIVE) {
      return;
    }

    let costPerClick = 0;

    if (
      promotion.billingModel === BillingModel.CPC ||
      promotion.billingModel === BillingModel.HYBRID
    ) {
      costPerClick = promotion.cpcUSD || 0;
    }

    // Log event and update spend
    await this.prisma.$transaction([
      this.prisma.promotionEvent.create({
        data: {
          promotionId,
          eventType: 'CLICK',
          restaurantId,
          productId,
          costUSD: costPerClick,
        },
      }),
      this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          spentUSD: { increment: costPerClick },
          clicks: { increment: 1 },
        },
      }),
    ]);

    // Check budget
    const updated = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (updated && updated.spentUSD >= updated.totalBudgetUSD) {
      await this.pauseCampaign(promotionId, 'BUDGET_EXHAUSTED');
    }

    // Update CTR
    await this.updateCTR(promotionId);
  }

  /**
   * Update CTR (click-through rate)
   */
  private async updateCTR(promotionId: string): Promise<void> {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { impressions: true, clicks: true },
    });

    if (!promotion || promotion.impressions === 0) return;

    const ctr = promotion.clicks / promotion.impressions;

    await this.prisma.promotion.update({
      where: { id: promotionId },
      data: { ctr },
    });
  }

  /**
   * Pause campaign (budget exhausted or admin action)
   */
  async pauseCampaign(
    promotionId: string,
    reason: string = 'PAUSED',
  ): Promise<void> {
    const newStatus =
      reason === 'BUDGET_EXHAUSTED'
        ? PromotionStatus.BUDGET_EXHAUSTED
        : PromotionStatus.PAUSED;

    await this.prisma.promotion.update({
      where: { id: promotionId },
      data: { status: newStatus },
    });

    // Log event
    await this.prisma.promotionEvent.create({
      data: {
        promotionId,
        eventType: 'STATUS_CHANGE',
        metadata: { reason, newStatus },
      },
    });

    // Invalidate cache
    const promotion = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
      select: { supplierId: true },
    });

    if (promotion) {
      await this.invalidateCache(promotion.supplierId);
    }

    this.logger.log(`Paused campaign ${promotionId}: ${reason}`);

    // TODO: Emit RMQ event for notifications
    // eventBus.emit('promotion.paused', { promotionId, reason });
  }

  /**
   * Get campaign analytics
   */
  async getCampaignAnalytics(promotionId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [promotion, dailyStats, events] = await Promise.all([
      this.prisma.promotion.findUnique({
        where: { id: promotionId },
      }),
      this.prisma.promotionDailyStats.findMany({
        where: {
          promotionId,
          date: { gte: since },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.promotionEvent.groupBy({
        by: ['eventType'],
        where: {
          promotionId,
          createdAt: { gte: since },
        },
        _count: true,
        _sum: { costUSD: true },
      }),
    ]);

    return {
      promotion,
      dailyStats,
      eventSummary: events.reduce((acc, e) => {
        acc[e.eventType] = {
          count: e._count,
          totalCost: e._sum.costUSD || 0,
        };
        return acc;
      }, {} as Record<string, any>),
      roi: promotion
        ? promotion.revenue > 0
          ? ((promotion.revenue - promotion.spentUSD) / promotion.spentUSD) * 100
          : 0
        : 0,
    };
  }
}

