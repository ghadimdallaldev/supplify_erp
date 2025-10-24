import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createLogger } from '@supplify/utils';
import Redis from 'ioredis';
import { Campaign, SponsoredItem } from '../campaigns/types/campaign.types';

const logger = createLogger('ads-engine');

@Injectable()
export class AdsEngineService {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async getEligibleCampaigns(placement: string): Promise<Campaign[]> {
    const cacheKey = `ads:eligible:v1:${placement}`;
    
    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        placement,
        status: 'ACTIVE',
        approved: true,
        startDate: { lte: now },
        endDate: { gte: now },
        // Budget checks
        OR: [
          { totalBudgetUSD: { gt: this.prisma.campaign.fields.spentUSD } },
          { dailyBudgetUSD: { not: null } }, // Will check daily budget separately
        ],
      },
      orderBy: { priorityScore: 'desc' },
    });

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(campaigns));
    
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
    const remainingBudget = Number(campaign.totalBudgetUSD) - Number(campaign.spentUSD);
    const dailyBudget = campaign.dailyBudgetUSD ? Number(campaign.dailyBudgetUSD) : Number(campaign.totalBudgetUSD) / 30;
    const budgetHealth = Math.min(1.2, Math.max(0.5, remainingBudget / dailyBudget));
    
    return base * priorityScore * ctrBoost * tierWeight * budgetHealth;
  }

  async blendSupplierResults(organicSuppliers: any[]): Promise<any[]> {
    const sponsoredCampaigns = await this.getEligibleCampaigns('SUPPLIER_CARD');
    
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
    const sponsoredCampaigns = await this.getEligibleCampaigns('PRODUCT_LIST');
    
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

    // Update spend (CPM)
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (campaign) {
      const spendIncrement = Number(campaign.cpmUSD) / 1000;
      const newSpent = Number(campaign.spentUSD) + spendIncrement;
      
      // Check budget limits
      if (newSpent >= Number(campaign.totalBudgetUSD)) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'EXHAUSTED' },
        });
        
        logger.warn(`Campaign ${campaignId} exhausted total budget`);
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

    // Update spend (CPC if set)
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (campaign && campaign.cpcUSD) {
      const spendIncrement = Number(campaign.cpcUSD);
      const newSpent = Number(campaign.spentUSD) + spendIncrement;
      
      // Check budget limits
      if (newSpent >= Number(campaign.totalBudgetUSD)) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'EXHAUSTED' },
        });
        
        logger.warn(`Campaign ${campaignId} exhausted total budget`);
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
    const placements = ['SUPPLIER_CARD', 'PRODUCT_LIST', 'SEARCH_RESULT'];
    
    for (const placement of placements) {
      const cacheKey = `ads:eligible:v1:${placement}`;
      await this.redis.del(cacheKey);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.disconnect();
  }
}
