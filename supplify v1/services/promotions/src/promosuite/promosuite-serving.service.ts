import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignType, SponsoredItem, DiscountInfo, FeaturedProduct } from '../campaigns/types/campaign.types';

@Injectable()
export class PromoSuiteServingService {
  private readonly logger = new Logger(PromoSuiteServingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Main serving method that handles all three campaign types
   */
  async servePromoSuiteContent(
    context: {
      userId?: string;
      orgId?: string;
      userRole?: string;
      userTier?: string;
      placement: 'SUPPLIER_CARD' | 'PRODUCT_LIST' | 'SEARCH_RESULT';
      organicItems: any[];
      searchQuery?: string;
      supplierId?: string;
    }
  ): Promise<{
    blendedItems: SponsoredItem[];
    discounts: DiscountInfo[];
    featuredProducts: FeaturedProduct[];
    metadata: {
      totalSponsored: number;
      totalOrganic: number;
      sponsoredPercentage: number;
    };
  }> {
    const { placement, organicItems, searchQuery, supplierId } = context;

    try {
      // Load eligible campaigns from cache or database
      const eligibleCampaigns = await this.loadEligibleCampaigns(placement, context);

      // Apply tier gating
      const tierGatedCampaigns = this.applyTierGating(eligibleCampaigns, context);

      // Separate campaigns by type
      const sponsoredCampaigns = tierGatedCampaigns.filter(c => c.type === CampaignType.SPONSORED_VISIBILITY);
      const discountCampaigns = tierGatedCampaigns.filter(c => c.type === CampaignType.DISCOUNT);
      const featuredCampaigns = tierGatedCampaigns.filter(c => c.type === CampaignType.FEATURED_PRODUCT);

      // Process each campaign type
      const blendedItems = await this.blendSponsoredItems(
        sponsoredCampaigns,
        organicItems,
        placement,
        searchQuery
      );

      const discounts = await this.getActiveDiscounts(
        discountCampaigns,
        supplierId,
        searchQuery
      );

      const featuredProducts = await this.getFeaturedProducts(
        featuredCampaigns,
        supplierId
      );

      // Calculate metadata
      const totalSponsored = blendedItems.filter(item => item.isSponsored).length;
      const totalOrganic = blendedItems.filter(item => !item.isSponsored).length;
      const sponsoredPercentage = totalSponsored > 0 ? (totalSponsored / blendedItems.length) * 100 : 0;

      return {
        blendedItems,
        discounts,
        featuredProducts,
        metadata: {
          totalSponsored,
          totalOrganic,
          sponsoredPercentage,
        },
      };
    } catch (error) {
      this.logger.error('Error serving PromoSuite content:', error);
      // Fallback to organic content
      return {
        blendedItems: organicItems.map(item => ({ ...item, isSponsored: false })),
        discounts: [],
        featuredProducts: [],
        metadata: {
          totalSponsored: 0,
          totalOrganic: organicItems.length,
          sponsoredPercentage: 0,
        },
      };
    }
  }

  /**
   * Load eligible campaigns with caching
   */
  private async loadEligibleCampaigns(
    placement: string,
    context: any
  ): Promise<any[]> {
    const cacheKey = `promosuite:eligible:v1:${placement}`;
    
    try {
      // Try cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Load from database
      const now = new Date();
      const campaigns = await this.prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          startDate: { lte: now },
          endDate: { gte: now },
          OR: [
            { placement: placement },
            { placement: null }, // Global campaigns
          ],
          // Budget checks
          OR: [
            { totalBudgetUSD: { gt: this.prisma.campaign.fields.spentUSD } },
            { dailyBudgetUSD: { gt: 0 } },
          ],
        },
        include: {
          stats: {
            where: {
              day: {
                gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
              },
            },
          },
        },
      });

      // Cache for 5 minutes
      await this.redis.setex(cacheKey, 300, JSON.stringify(campaigns));
      
      return campaigns;
    } catch (error) {
      this.logger.error('Error loading eligible campaigns:', error);
      return [];
    }
  }

  /**
   * Apply tier-based gating
   */
  private applyTierGating(campaigns: any[], context: any): any[] {
    return campaigns.filter(campaign => {
      // Check if user/supplier has required tier
      const requiredTier = this.getRequiredTier(campaign.type);
      const userTier = context.userTier || 'FREE';
      
      return this.isTierSufficient(userTier, requiredTier);
    });
  }

  /**
   * Blend sponsored items with organic content
   */
  private async blendSponsoredItems(
    campaigns: any[],
    organicItems: any[],
    placement: string,
    searchQuery?: string
  ): Promise<SponsoredItem[]> {
    if (campaigns.length === 0) {
      return organicItems.map(item => ({ ...item, isSponsored: false }));
    }

    // Calculate sponsored scores and rank campaigns
    const rankedCampaigns = campaigns
      .map(campaign => ({
        ...campaign,
        sponsoredScore: this.calculateSponsoredScore(campaign),
      }))
      .sort((a, b) => b.sponsoredScore - a.sponsoredScore);

    // Apply blending rules based on placement
    const blendedItems: SponsoredItem[] = [];
    const usedOrganicIndices = new Set<number>();

    if (placement === 'SUPPLIER_CARD') {
      // Reserve top 1-2 slots for sponsored suppliers
      const maxSponsored = Math.min(2, rankedCampaigns.length);
      
      for (let i = 0; i < maxSponsored; i++) {
        const campaign = rankedCampaigns[i];
        const sponsoredItem = this.createSponsoredItem(campaign, 'SUPPLIER_CARD');
        if (sponsoredItem) {
          blendedItems.push(sponsoredItem);
        }
      }

      // Add remaining organic items
      organicItems.forEach((item, index) => {
        if (!usedOrganicIndices.has(index)) {
          blendedItems.push({ ...item, isSponsored: false });
        }
      });
    } else {
      // PRODUCT_LIST and SEARCH_RESULT: inject up to 3 sponsored items
      const maxSponsored = Math.min(3, rankedCampaigns.length);
      const injectionPositions = [0, 2, 5]; // Positions 1, 3, 6
      
      let sponsoredIndex = 0;
      let organicIndex = 0;

      for (let i = 0; i < Math.max(blendedItems.length + organicItems.length, 10); i++) {
        if (sponsoredIndex < maxSponsored && injectionPositions.includes(i)) {
          const campaign = rankedCampaigns[sponsoredIndex];
          const sponsoredItem = this.createSponsoredItem(campaign, placement);
          if (sponsoredItem) {
            blendedItems.push(sponsoredItem);
            sponsoredIndex++;
          }
        } else if (organicIndex < organicItems.length) {
          blendedItems.push({ ...organicItems[organicIndex], isSponsored: false });
          organicIndex++;
        }
      }

      // Ensure we don't exceed 30% sponsored content
      const maxSponsoredAllowed = Math.floor(blendedItems.length * 0.3);
      if (blendedItems.filter(item => item.isSponsored).length > maxSponsoredAllowed) {
        // Remove excess sponsored items
        const sponsoredItems = blendedItems.filter(item => item.isSponsored);
        const organicItems = blendedItems.filter(item => !item.isSponsored);
        
        return [
          ...sponsoredItems.slice(0, maxSponsoredAllowed),
          ...organicItems,
        ];
      }
    }

    return blendedItems;
  }

  /**
   * Calculate sponsored score for ranking
   */
  private calculateSponsoredScore(campaign: any): number {
    const base = 1.0;
    const priorityScore = campaign.priorityScore || 1.0;
    
    // CTR boost (mock - in real implementation, use historical CTR)
    const ctrBoost = Math.max(0.6, Math.random() * 1.5); // Mock CTR between 0.6-2.1
    
    // Tier weight
    const tierWeight = this.getTierWeight(campaign.supplierTier || 'FREE');
    
    // Budget health
    const dailyBudget = campaign.dailyBudgetUSD || campaign.totalBudgetUSD / 30;
    const remainingToday = dailyBudget - (campaign.spentUSD || 0);
    const budgetHealth = Math.max(0.5, Math.min(1.2, remainingToday / dailyBudget));
    
    return base * priorityScore * ctrBoost * tierWeight * budgetHealth;
  }

  /**
   * Create sponsored item from campaign
   */
  private createSponsoredItem(campaign: any, placement: string): SponsoredItem | null {
    try {
      // Mock implementation - in real app, fetch actual supplier/product data
      const mockItem = {
        id: campaign.targetIds[0] || `item_${campaign.id}`,
        name: `Sponsored ${campaign.name}`,
        isSponsored: true,
        campaignId: campaign.id,
        sponsorSupplierId: campaign.supplierId,
        sponsoredRank: 1,
        priorityScore: campaign.priorityScore,
      };

      return mockItem;
    } catch (error) {
      this.logger.error('Error creating sponsored item:', error);
      return null;
    }
  }

  /**
   * Get active discounts for products
   */
  private async getActiveDiscounts(
    campaigns: any[],
    supplierId?: string,
    searchQuery?: string
  ): Promise<DiscountInfo[]> {
    const discounts: DiscountInfo[] = [];

    for (const campaign of campaigns) {
      try {
        // Filter by supplier if specified
        if (supplierId && campaign.supplierId !== supplierId) {
          continue;
        }

        // Check if campaign targets match search query
        if (searchQuery && !this.matchesSearchQuery(campaign, searchQuery)) {
          continue;
        }

        // Mock discount calculation - in real app, fetch actual product prices
        const originalPrice = 10.00; // Mock price
        const discountValue = campaign.discountValue || 0;
        const discountType = campaign.discountType || 'PERCENT';
        
        let promoPrice: number;
        let compareAtPrice: number;
        let savingsPercent: number;

        if (discountType === 'PERCENT') {
          promoPrice = originalPrice * (1 - discountValue / 100);
          compareAtPrice = originalPrice;
          savingsPercent = discountValue;
        } else {
          promoPrice = Math.max(0, originalPrice - discountValue);
          compareAtPrice = originalPrice;
          savingsPercent = (discountValue / originalPrice) * 100;
        }

        discounts.push({
          campaignId: campaign.id,
          discountType: discountType as 'PERCENT' | 'AMOUNT',
          discountValue,
          minQty: campaign.minQty,
          endDate: campaign.endDate,
          promoPrice,
          compareAtPrice,
          savingsPercent,
        });
      } catch (error) {
        this.logger.error('Error processing discount campaign:', error);
      }
    }

    return discounts;
  }

  /**
   * Get featured products
   */
  private async getFeaturedProducts(
    campaigns: any[],
    supplierId?: string
  ): Promise<FeaturedProduct[]> {
    const featured: FeaturedProduct[] = [];

    for (const campaign of campaigns) {
      try {
        // Filter by supplier if specified
        if (supplierId && campaign.supplierId !== supplierId) {
          continue;
        }

        featured.push({
          id: campaign.targetIds[0] || `product_${campaign.id}`,
          campaignId: campaign.id,
          supplierId: campaign.supplierId,
          slots: campaign.featureSlots || 1,
          endDate: campaign.endDate,
        });
      } catch (error) {
        this.logger.error('Error processing featured campaign:', error);
      }
    }

    return featured;
  }

  /**
   * Track impression for sponsored content
   */
  async trackImpression(campaignId: string, viewId: string, context: any): Promise<void> {
    try {
      // Check for duplicate impressions (idempotency)
      const duplicateKey = `promosuite:impression:${campaignId}:${viewId}`;
      const exists = await this.redis.exists(duplicateKey);
      if (exists) {
        return; // Already tracked
      }

      // Set duplicate guard (15 minutes)
      await this.redis.setex(duplicateKey, 900, '1');

      // Get campaign details
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== 'ACTIVE') {
        return;
      }

      // Calculate spend
      const spendAmount = campaign.cpmUSD / 1000;
      
      // Check budget constraints
      if (await this.wouldExceedBudget(campaign, spendAmount)) {
        await this.pauseCampaignForBudgetExhaustion(campaign);
        return;
      }

      // Update spend
      await this.updateCampaignSpend(campaignId, spendAmount);

      // Log impression
      await this.logImpression(campaignId, context);

      // Update daily stats
      await this.updateDailyStats(campaignId, 'impression');

      this.logger.log(`Tracked impression for campaign ${campaignId}`);
    } catch (error) {
      this.logger.error('Error tracking impression:', error);
    }
  }

  /**
   * Track click for sponsored content
   */
  async trackClick(campaignId: string, context: any): Promise<void> {
    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.status !== 'ACTIVE') {
        return;
      }

      // Calculate spend
      const spendAmount = campaign.cpcUSD || 0;
      
      if (spendAmount > 0) {
        // Check budget constraints
        if (await this.wouldExceedBudget(campaign, spendAmount)) {
          await this.pauseCampaignForBudgetExhaustion(campaign);
          return;
        }

        // Update spend
        await this.updateCampaignSpend(campaignId, spendAmount);
      }

      // Log click
      await this.logClick(campaignId, context);

      // Update daily stats
      await this.updateDailyStats(campaignId, 'click');

      this.logger.log(`Tracked click for campaign ${campaignId}`);
    } catch (error) {
      this.logger.error('Error tracking click:', error);
    }
  }

  /**
   * Helper methods
   */
  private getRequiredTier(campaignType: CampaignType): string {
    switch (campaignType) {
      case CampaignType.SPONSORED_VISIBILITY:
      case CampaignType.DISCOUNT:
      case CampaignType.FEATURED_PRODUCT:
        return 'PRO';
      default:
        return 'FREE';
    }
  }

  private isTierSufficient(userTier: string, requiredTier: string): boolean {
    const tierOrder = ['FREE', 'PRO', 'PREMIUM'];
    const userIndex = tierOrder.indexOf(userTier);
    const requiredIndex = tierOrder.indexOf(requiredTier);
    return userIndex >= requiredIndex;
  }

  private getTierWeight(tier: string): number {
    switch (tier) {
      case 'PREMIUM': return 1.20;
      case 'PRO': return 1.05;
      default: return 1.00;
    }
  }

  private matchesSearchQuery(campaign: any, searchQuery: string): boolean {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    return campaign.keywords.some((keyword: string) => 
      keyword.toLowerCase().includes(query)
    );
  }

  private async wouldExceedBudget(campaign: any, spendAmount: number): Promise<boolean> {
    const currentSpend = campaign.spentUSD || 0;
    
    // Check total budget
    if (campaign.totalBudgetUSD && currentSpend + spendAmount > campaign.totalBudgetUSD) {
      return true;
    }

    // Check daily budget
    if (campaign.dailyBudgetUSD) {
      const todaySpend = await this.getTodaySpend(campaign.id);
      if (todaySpend + spendAmount > campaign.dailyBudgetUSD) {
        return true;
      }
    }

    return false;
  }

  private async getTodaySpend(campaignId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = await this.prisma.adStat.findFirst({
      where: {
        campaignId,
        day: today,
      },
    });

    return stats?.spendUSD || 0;
  }

  private async pauseCampaignForBudgetExhaustion(campaign: any): Promise<void> {
    await this.prisma.campaign.update({
      where: { id: campaign.id },
      data: { 
        status: 'EXHAUSTED',
        updatedAt: new Date(),
      },
    });

    // Clear cache
    await this.clearCampaignCache(campaign.placement);

    this.logger.log(`Campaign ${campaign.id} paused due to budget exhaustion`);
  }

  private async updateCampaignSpend(campaignId: string, amount: number): Promise<void> {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        spentUSD: {
          increment: amount,
        },
        updatedAt: new Date(),
      },
    });
  }

  private async logImpression(campaignId: string, context: any): Promise<void> {
    await this.prisma.impressionLog.create({
      data: {
        campaignId,
        userId: context.userId,
        orgId: context.orgId,
        viewId: context.viewId,
      },
    });
  }

  private async logClick(campaignId: string, context: any): Promise<void> {
    await this.prisma.clickLog.create({
      data: {
        campaignId,
        userId: context.userId,
        orgId: context.orgId,
        ip: context.ip,
        ua: context.userAgent,
      },
    });
  }

  private async updateDailyStats(campaignId: string, type: 'impression' | 'click'): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.adStat.upsert({
      where: {
        campaignId_day: {
          campaignId,
          day: today,
        },
      },
      update: {
        [type]: {
          increment: 1,
        },
      },
      create: {
        campaignId,
        day: today,
        [type]: 1,
        impressions: type === 'impression' ? 1 : 0,
        clicks: type === 'click' ? 1 : 0,
        spendUSD: 0,
      },
    });
  }

  private async clearCampaignCache(placement?: string): Promise<void> {
    if (placement) {
      await this.redis.del(`promosuite:eligible:v1:${placement}`);
    } else {
      // Clear all placement caches
      const keys = await this.redis.keys('promosuite:eligible:v1:*');
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}
