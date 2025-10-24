import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createLogger } from '@supplify/utils';
import { CreateCampaignDto, UpdateCampaignDto, CampaignStatusDto, CampaignType } from './dto/campaign.dto';
import { Campaign, CampaignStatus } from './types/campaign.types';

const logger = createLogger('campaigns');

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async createCampaign(supplierId: string, userId: string, dto: CreateCampaignDto): Promise<Campaign> {
    // Validate dates
    if (dto.startDate >= dto.endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    if (dto.startDate < new Date()) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    // Type-specific validation
    this.validateCampaignType(dto);

    const campaign = await this.prisma.campaign.create({
      data: {
        ...dto,
        supplierId,
        createdBy: userId,
        status: 'PENDING', // Requires admin approval
      },
    });

    logger.info(`Campaign created: ${campaign.id} (${dto.type}) by supplier ${supplierId}`);
    return campaign;
  }

  private validateCampaignType(dto: CreateCampaignDto): void {
    switch (dto.type) {
      case CampaignType.SPONSORED_VISIBILITY:
        if (!dto.placement) {
          throw new BadRequestException('Placement is required for Sponsored Visibility campaigns');
        }
        if (!dto.totalBudgetUSD || dto.totalBudgetUSD <= 0) {
          throw new BadRequestException('Total budget is required for Sponsored Visibility campaigns');
        }
        if (!dto.cpmUSD || dto.cpmUSD <= 0) {
          throw new BadRequestException('CPM is required for Sponsored Visibility campaigns');
        }
        break;

      case CampaignType.DISCOUNT:
        if (!dto.discountType) {
          throw new BadRequestException('Discount type is required for Discount campaigns');
        }
        if (!dto.discountValue || dto.discountValue <= 0) {
          throw new BadRequestException('Discount value is required for Discount campaigns');
        }
        if (dto.discountType === 'PERCENT' && dto.discountValue > 90) {
          throw new BadRequestException('Discount percentage cannot exceed 90%');
        }
        break;

      case CampaignType.FEATURED_PRODUCT:
        if (!dto.featureSlots || dto.featureSlots < 1 || dto.featureSlots > 3) {
          throw new BadRequestException('Feature slots must be between 1 and 3');
        }
        break;
    }
  }

  async updateCampaign(id: string, supplierId: string, dto: UpdateCampaignDto): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.supplierId !== supplierId) {
      throw new ForbiddenException('You can only update your own campaigns');
    }

    if (campaign.status === 'ACTIVE') {
      throw new BadRequestException('Cannot update active campaigns');
    }

    // Validate dates if provided
    if (dto.startDate && dto.endDate && dto.startDate >= dto.endDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const updatedCampaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...dto,
        status: 'PENDING', // Reset to pending for re-approval
        approved: false,
        approvedBy: null,
        approvedAt: null,
      },
    });

    logger.info(`Campaign updated: ${id}`);
    return updatedCampaign;
  }

  async getCampaignsBySupplier(supplierId: string, status?: string): Promise<Campaign[]> {
    const where: any = { supplierId };
    
    if (status) {
      where.status = status;
    }

    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaignById(id: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return campaign;
  }

  async updateCampaignStatus(id: string, status: CampaignStatus, adminId?: string): Promise<Campaign> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const updateData: any = { status };

    if (status === 'ACTIVE' && adminId) {
      updateData.approved = true;
      updateData.approvedBy = adminId;
      updateData.approvedAt = new Date();
    }

    const updatedCampaign = await this.prisma.campaign.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Campaign ${id} status updated to ${status}`);
    return updatedCampaign;
  }

  async deleteCampaign(id: string, supplierId: string): Promise<boolean> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.supplierId !== supplierId) {
      throw new ForbiddenException('You can only delete your own campaigns');
    }

    if (campaign.status === 'ACTIVE') {
      throw new BadRequestException('Cannot delete active campaigns');
    }

    await this.prisma.campaign.delete({
      where: { id },
    });

    logger.info(`Campaign deleted: ${id}`);
    return true;
  }

  async getCampaignsForReview(status?: string): Promise<Campaign[]> {
    const where: any = {};
    
    if (status) {
      where.status = status;
    } else {
      where.status = 'PENDING';
    }

    return this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getCampaignStats(supplierId: string): Promise<{
    active: number;
    totalBudgetUSD: number;
    totalSpentUSD: number;
    totalImpressions: number;
    totalClicks: number;
    ctr: number;
  }> {
    const campaigns = await this.prisma.campaign.findMany({
      where: { supplierId },
      include: {
        stats: true,
      },
    });

    const active = campaigns.filter(c => c.status === 'ACTIVE').length;
    const totalBudgetUSD = campaigns.reduce((sum, c) => sum + Number(c.totalBudgetUSD), 0);
    const totalSpentUSD = campaigns.reduce((sum, c) => sum + Number(c.spentUSD), 0);
    
    const totalImpressions = campaigns.reduce((sum, c) => 
      sum + c.stats.reduce((statSum, stat) => statSum + stat.impressions, 0), 0);
    
    const totalClicks = campaigns.reduce((sum, c) => 
      sum + c.stats.reduce((statSum, stat) => statSum + stat.clicks, 0), 0);
    
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    return {
      active,
      totalBudgetUSD,
      totalSpentUSD,
      totalImpressions,
      totalClicks,
      ctr: Number(ctr.toFixed(2)),
    };
  }
}
