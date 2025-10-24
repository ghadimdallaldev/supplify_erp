import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdsEngineService } from '../ads/ads-engine.service';
import { PromotionStatus, PromotionType } from '@prisma/client';

/**
 * Promotions Service
 * Manages sponsored campaigns with tier enforcement
 */
@Injectable()
export class PromotionsService {
  constructor(
    private prisma: PrismaService,
    private adsEngine: AdsEngineService,
  ) {}

  /**
   * Create a new promotion campaign
   */
  async createPromotion(supplierId: string, data: any) {
    // TODO: Check entitlements (requires subscriptions service integration)
    // const entitlements = await subscriptionsService.getEntitlements(supplierId, 'SUPPLIER');
    // if (!hasFeature(entitlements, 'promotions')) {
    //   throw new ForbiddenException('Upgrade to Pro for sponsored campaigns');
    // }

    const promotion = await this.prisma.promotion.create({
      data: {
        supplierId,
        type: data.type || PromotionType.SPONSORED_VISIBILITY,
        name: data.name,
        description: data.description,
        status: PromotionStatus.PENDING_APPROVAL,
        billingModel: data.billingModel,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        dailyBudgetUSD: data.dailyBudgetUSD,
        totalBudgetUSD: data.totalBudgetUSD,
        cpmUSD: data.cpmUSD || 1.0,
        cpcUSD: data.cpcUSD,
        targetType: data.targetType,
        targetIds: data.targetIds,
        keywords: data.keywords || [],
        priorityScore: data.priorityScore || 1.0,
        isFeatured: data.isFeatured || false,
      },
    });

    return promotion;
  }

  /**
   * Get promotions for a supplier
   */
  async getPromotions(supplierId: string, status?: PromotionStatus) {
    return this.prisma.promotion.findMany({
      where: {
        supplierId,
        ...(status && { status }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Get promotion by ID
   */
  async getPromotion(id: string) {
    const promotion = await this.prisma.promotion.findUnique({
      where: { id },
    });

    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }

    return promotion;
  }

  /**
   * Approve promotion (admin only)
   */
  async approvePromotion(promotionId: string, adminId: string, note?: string) {
    const promotion = await this.getPromotion(promotionId);

    if (promotion.status !== PromotionStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Promotion is not pending approval');
    }

    await this.prisma.$transaction([
      this.prisma.promotion.update({
        where: { id: promotionId },
        data: { status: PromotionStatus.ACTIVE },
      }),
      this.prisma.promotionApproval.create({
        data: {
          promotionId,
          adminId,
          action: 'APPROVED',
          note,
          previousStatus: promotion.status,
          newStatus: PromotionStatus.ACTIVE,
        },
      }),
    ]);

    // Invalidate cache
    await this.adsEngine.invalidateCache(promotion.supplierId);

    return this.getPromotion(promotionId);
  }

  /**
   * Reject promotion (admin only)
   */
  async rejectPromotion(promotionId: string, adminId: string, note: string) {
    const promotion = await this.getPromotion(promotionId);

    await this.prisma.$transaction([
      this.prisma.promotion.update({
        where: { id: promotionId },
        data: { status: PromotionStatus.REJECTED },
      }),
      this.prisma.promotionApproval.create({
        data: {
          promotionId,
          adminId,
          action: 'REJECTED',
          note,
          previousStatus: promotion.status,
          newStatus: PromotionStatus.REJECTED,
        },
      }),
    ]);

    return this.getPromotion(promotionId);
  }

  /**
   * Pause promotion
   */
  async pausePromotion(promotionId: string, userId: string) {
    const promotion = await this.getPromotion(promotionId);

    await this.prisma.promotion.update({
      where: { id: promotionId },
      data: { status: PromotionStatus.PAUSED },
    });

    await this.adsEngine.invalidateCache(promotion.supplierId);

    return this.getPromotion(promotionId);
  }

  /**
   * Resume promotion
   */
  async resumePromotion(promotionId: string, userId: string) {
    const promotion = await this.getPromotion(promotionId);

    if (promotion.status !== PromotionStatus.PAUSED) {
      throw new BadRequestException('Promotion is not paused');
    }

    await this.prisma.promotion.update({
      where: { id: promotionId },
      data: { status: PromotionStatus.ACTIVE },
    });

    await this.adsEngine.invalidateCache(promotion.supplierId);

    return this.getPromotion(promotionId);
  }

  /**
   * Get pending approvals (admin only)
   */
  async getPendingApprovals() {
    return this.prisma.promotion.findMany({
      where: {
        status: PromotionStatus.PENDING_APPROVAL,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Get active campaigns
   */
  async getActiveCampaigns(supplierId?: string, limit = 50) {
    return this.prisma.promotion.findMany({
      where: {
        status: PromotionStatus.ACTIVE,
        ...(supplierId && { supplierId }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }
}

