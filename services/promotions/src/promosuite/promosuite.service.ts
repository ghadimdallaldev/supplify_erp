import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createLogger } from '@supplify/utils';
import Redis from 'ioredis';
import { Campaign, DiscountInfo, FeaturedProduct } from '../campaigns/types/campaign.types';

const logger = createLogger('promosuite');

@Injectable()
export class PromoSuiteService implements OnModuleDestroy {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  // Sponsored Visibility Logic
  async getEligibleSponsoredCampaigns(placement: string): Promise<Campaign[]> {
    const cacheKey = `promosuite:eligible:sv:${placement}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'SPONSORED_VISIBILITY',
        placement,
        status: 'ACTIVE',
        approved: true,
        startDate: { lte: now },
        endDate: { gte: now },
        // Budget checks
        OR: [
          { totalBudgetUSD: { gt: this.prisma.campaign.fields.spentUSD } },
          { dailyBudgetUSD: { not: null } },
        ],
      },
      orderBy: { priorityScore: 'desc' },
    });

    // Cache for 10 minutes
    await this.redis.setex(cacheKey, 600, JSON.stringify(campaigns));
    
    return campaigns;
  }

  async calculateSponsoredScore(campaign: Campaign): Promise<number> {
    const base = 1.0;
    const priorityScore = campaign.priorityScore;
    
    // Get recent CTR (simplified - in real implementation, calculate from stats)
    const ctrBoost = Math.max(0.6, 1.0); // Placeholder
    
    // Tier weight (would need supplier tier info)
    const tierWeight = 1.0; // Placeholder
    
    // Budget health
    const remainingBudget = Number(campaign.totalBudgetUSD || 0) - Number(campaign.spentUSD);
    const dailyBudget = campaign.dailyBudgetUSD ? Number(campaign.dailyBudgetUSD) : Number(campaign.totalBudgetUSD || 0) / 30;
    const budgetHealth = Math.min(1.2, Math.max(0.5, remainingBudget / dailyBudget));
    
    return base * priorityScore * ctrBoost * tierWeight * budgetHealth;
  }

  async blendSupplierResults(organicSuppliers: any[]): Promise<any[]> {
    const sponsoredCampaigns = await this.getEligibleSponsoredCampaigns('SUPPLIER_CARD');
    
    if (sponsoredCampaigns.length === 0) {
      return organicSuppliers;
    }

    const sponsoredSuppliers = [];
    
    for (const campaign of sponsoredCampaigns.slice(0, 2)) { // Max 2 sponsored
      if (campaign.targetType === 'SUPPLIER' && campaign.targetIds.length > 0) {
        const supplierId = campaign.targetIds[0];
        const sponsoredScore = await this.calculateSponsoredScore(campaign);
        
        sponsoredSuppliers.push({
          id: supplierId,
          isSponsored: true,
          campaignId: campaign.id,
          sponsorSupplierId: campaign.supplierId,
          sponsoredRank: sponsoredSuppliers.length + 1,
          priorityScore: sponsoredScore,
        });
      }
    }

    // Remove sponsored suppliers from organic list
    const sponsoredIds = sponsoredSuppliers.map(s => s.id);
    const filteredOrganic = organicSuppliers.filter(s => !sponsoredIds.includes(s.id));

    // Blend: sponsored at top, then organic
    return [...sponsoredSuppliers, ...filteredOrganic];
  }

  async blendProductResults(organicProducts: any[], searchQuery?: string): Promise<any[]> {
    const sponsoredCampaigns = await this.getEligibleSponsoredCampaigns('PRODUCT_LIST');
    
    if (sponsoredCampaigns.length === 0) {
      return organicProducts;
    }

    const sponsoredProducts = [];
    const maxSponsored = Math.min(3, Math.floor(organicProducts.length * 0.3)); // Max 30% sponsored
    
    for (const campaign of sponsoredCampaigns.slice(0, maxSponsored)) {
      if (campaign.targetType === 'PRODUCT' && campaign.targetIds.length > 0) {
        const productId = campaign.targetIds[0];
        const sponsoredScore = await this.calculateSponsoredScore(campaign);
        
        sponsoredProducts.push({
          id: productId,
          isSponsored: true,
          campaignId: campaign.id,
          sponsorSupplierId: campaign.supplierId,
          sponsoredRank: sponsoredProducts.length + 1,
          priorityScore: sponsoredScore,
        });
      }
    }

    // Remove sponsored products from organic list
    const sponsoredIds = sponsoredProducts.map(p => p.id);
    const filteredOrganic = organicProducts.filter(p => !sponsoredIds.includes(p.id));

    // Blend: inject sponsored at positions 1, 3, 6 (if available)
    const blended = [...filteredOrganic];
    const injectPositions = [0, 2, 5]; // 0-indexed positions 1, 3, 6
    
    sponsoredProducts.forEach((sponsored, index) => {
      const position = injectPositions[index];
      if (position < blended.length) {
        blended.splice(position, 0, sponsored);
      } else {
        blended.push(sponsored);
      }
    });

    return blended;
  }

  // Discount Campaign Logic
  async getActiveDiscounts(supplierId: string): Promise<Map<string, DiscountInfo>> {
    const cacheKey = `promosuite:discounts:${supplierId}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return new Map(JSON.parse(cached));
    }

    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'DISCOUNT',
        supplierId,
        status: 'ACTIVE',
        approved: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    const discountMap = new Map<string, DiscountInfo>();
    
    campaigns.forEach(campaign => {
      campaign.targetIds.forEach(productId => {
        discountMap.set(productId, {
          campaignId: campaign.id,
          discountType: campaign.discountType as any,
          discountValue: Number(campaign.discountValue),
          minQty: campaign.minQty,
          endDate: campaign.endDate,
          promoPrice: 0, // Will be calculated per product
          compareAtPrice: 0, // Will be calculated per product
          savingsPercent: 0, // Will be calculated per product
        });
      });
    });

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(Array.from(discountMap.entries())));
    
    return discountMap;
  }

  calculatePromoPrice(originalPrice: number, discountType: string, discountValue: number): {
    promoPrice: number;
    compareAtPrice: number;
    savingsPercent: number;
  } {
    const compareAtPrice = originalPrice;
    let promoPrice: number;

    if (discountType === 'PERCENT') {
      promoPrice = originalPrice * (1 - discountValue / 100);
    } else { // AMOUNT
      promoPrice = Math.max(0, originalPrice - discountValue);
    }

    const savingsPercent = ((compareAtPrice - promoPrice) / compareAtPrice) * 100;

    return {
      promoPrice: Number(promoPrice.toFixed(2)),
      compareAtPrice,
      savingsPercent: Number(savingsPercent.toFixed(1)),
    };
  }

  // Featured Product Logic
  async getFeaturedProducts(supplierId: string): Promise<FeaturedProduct[]> {
    const cacheKey = `promosuite:featured:${supplierId}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        type: 'FEATURED_PRODUCT',
        supplierId,
        status: 'ACTIVE',
        approved: true,
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { priorityScore: 'desc' },
    });

    const featuredProducts: FeaturedProduct[] = [];
    
    campaigns.forEach(campaign => {
      campaign.targetIds.forEach(productId => {
        featuredProducts.push({
          id: productId,
          campaignId: campaign.id,
          supplierId: campaign.supplierId,
          slots: campaign.featureSlots || 1,
          endDate: campaign.endDate,
        });
      });
    });

    // Cache for 10 minutes
    await this.redis.setex(cacheKey, 600, JSON.stringify(featuredProducts));
    
    return featuredProducts;
  }

  // Tracking and Budget Management
  async logImpression(campaignId: string, userId?: string, orgId?: string, viewId?: string): Promise<void> {
    // Check for duplicate impression (idempotent)
    if (viewId) {
      const existing = await this.prisma.impressionLog.findFirst({
        where: { campaignId, viewId },
      });
      
      if (existing) {
        return; // Already logged
      }
    }

    // Log impression
    await this.prisma.impressionLog.create({
      data: {
        campaignId,
        userId,
        orgId,
        viewId,
      },
    });

    // Update spend (CPM) - only for Sponsored Visibility
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (campaign && campaign.type === 'SPONSORED_VISIBILITY' && campaign.cpmUSD) {
      const spendIncrement = Number(campaign.cpmUSD) / 1000;
      const newSpent = Number(campaign.spentUSD) + spendIncrement;
      
      // Check budget limits
      if (campaign.totalBudgetUSD && newSpent >= Number(campaign.totalBudgetUSD)) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'EXHAUSTED' },
        });
        
        logger.warn(`Campaign ${campaignId} exhausted total budget`);
        await this.bustCache();
        return;
      }

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { spentUSD: newSpent },
      });
    }

    // Bust cache
    await this.bustCache();
  }

  async logClick(campaignId: string, userId?: string, orgId?: string, ip?: string, ua?: string): Promise<void> {
    // Log click
    await this.prisma.clickLog.create({
      data: {
        campaignId,
        userId,
        orgId,
        ip,
        ua,
      },
    });

    // Update spend (CPC) - only for Sponsored Visibility
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (campaign && campaign.type === 'SPONSORED_VISIBILITY' && campaign.cpcUSD) {
      const spendIncrement = Number(campaign.cpcUSD);
      const newSpent = Number(campaign.spentUSD) + spendIncrement;
      
      // Check budget limits
      if (campaign.totalBudgetUSD && newSpent >= Number(campaign.totalBudgetUSD)) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'EXHAUSTED' },
        });
        
        logger.warn(`Campaign ${campaignId} exhausted total budget`);
        await this.bustCache();
        return;
      }

      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { spentUSD: newSpent },
      });
    }

    // Bust cache
    await this.bustCache();
  }

  private async bustCache(): Promise<void> {
    const patterns = [
      'promosuite:eligible:sv:*',
      'promosuite:discounts:*',
      'promosuite:featured:*',
    ];
    
    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.disconnect();
  }
}
