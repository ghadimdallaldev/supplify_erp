import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { AdsEngineService } from '../ads/ads-engine.service';

@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly adsEngine: AdsEngineService,
  ) {}

  @Post()
  async createPromotion(@Body() data: any) {
    return this.promotionsService.createPromotion(data.supplierId, data);
  }

  @Get('supplier/:supplierId')
  async getPromotions(
    @Param('supplierId') supplierId: string,
    @Query('status') status?: string,
  ) {
    return this.promotionsService.getPromotions(supplierId, status as any);
  }

  @Get(':id')
  async getPromotion(@Param('id') id: string) {
    return this.promotionsService.getPromotion(id);
  }

  @Get(':id/analytics')
  async getPromotionAnalytics(
    @Param('id') id: string,
    @Query('days') days?: string,
  ) {
    return this.adsEngine.getCampaignAnalytics(id, days ? parseInt(days) : 30);
  }

  @Post(':id/approve')
  async approvePromotion(
    @Param('id') id: string,
    @Body() data: { adminId: string; note?: string },
  ) {
    return this.promotionsService.approvePromotion(id, data.adminId, data.note);
  }

  @Post(':id/reject')
  async rejectPromotion(
    @Param('id') id: string,
    @Body() data: { adminId: string; note: string },
  ) {
    return this.promotionsService.rejectPromotion(id, data.adminId, data.note);
  }

  @Put(':id/pause')
  async pausePromotion(
    @Param('id') id: string,
    @Body() data: { userId: string },
  ) {
    return this.promotionsService.pausePromotion(id, data.userId);
  }

  @Put(':id/resume')
  async resumePromotion(
    @Param('id') id: string,
    @Body() data: { userId: string },
  ) {
    return this.promotionsService.resumePromotion(id, data.userId);
  }

  @Get('admin/pending')
  async getPendingApprovals() {
    return this.promotionsService.getPendingApprovals();
  }

  @Get('admin/active')
  async getActiveCampaigns(
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.promotionsService.getActiveCampaigns(
      supplierId,
      limit ? parseInt(limit) : undefined,
    );
  }

  @Post('track/impression')
  async logImpression(@Body() data: { promotionId: string; restaurantId: string; productId: string }) {
    await this.adsEngine.logImpression(data.promotionId, data.restaurantId, data.productId);
    return { success: true };
  }

  @Post('track/click')
  async logClick(@Body() data: { promotionId: string; restaurantId: string; productId: string }) {
    await this.adsEngine.logClick(data.promotionId, data.restaurantId, data.productId);
    return { success: true };
  }
}

