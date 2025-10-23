import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PromotionsService } from './promotions.service';
import { AdsEngineService } from '../ads/ads-engine.service';

/**
 * RabbitMQ Message Handlers for Promotions
 */
@Controller()
export class PromotionsHandlers {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly adsEngine: AdsEngineService,
  ) {}

  @MessagePattern('promotions.create')
  async createPromotion(@Payload() data: any) {
    return this.promotionsService.createPromotion(data.supplierId, data);
  }

  @MessagePattern('promotions.getForSupplier')
  async getPromotions(@Payload() data: { supplierId: string; status?: string }) {
    return this.promotionsService.getPromotions(data.supplierId, data.status as any);
  }

  @MessagePattern('promotions.getById')
  async getPromotion(@Payload() data: { id: string }) {
    return this.promotionsService.getPromotion(data.id);
  }

  @MessagePattern('promotions.getAnalytics')
  async getAnalytics(@Payload() data: { id: string; days?: number }) {
    return this.adsEngine.getCampaignAnalytics(data.id, data.days);
  }

  @MessagePattern('promotions.approve')
  async approvePromotion(@Payload() data: { promotionId: string; adminId: string; note?: string }) {
    return this.promotionsService.approvePromotion(data.promotionId, data.adminId, data.note);
  }

  @MessagePattern('promotions.reject')
  async rejectPromotion(@Payload() data: { promotionId: string; adminId: string; note: string }) {
    return this.promotionsService.rejectPromotion(data.promotionId, data.adminId, data.note);
  }

  @MessagePattern('promotions.pause')
  async pausePromotion(@Payload() data: { id: string; userId: string }) {
    return this.promotionsService.pausePromotion(data.id, data.userId);
  }

  @MessagePattern('promotions.resume')
  async resumePromotion(@Payload() data: { id: string; userId: string }) {
    return this.promotionsService.resumePromotion(data.id, data.userId);
  }

  @MessagePattern('promotions.getPending')
  async getPendingApprovals() {
    return this.promotionsService.getPendingApprovals();
  }

  @MessagePattern('promotions.getActive')
  async getActiveCampaigns(@Payload() data: { supplierId?: string; limit?: number }) {
    return this.promotionsService.getActiveCampaigns(data.supplierId, data.limit);
  }

  @MessagePattern('ads.blendResults')
  async blendResults(@Payload() data: { organicResults: any[]; options: any }) {
    return this.adsEngine.blendResults(data.organicResults, data.options);
  }

  @MessagePattern('promotions.logImpression')
  async logImpression(
    @Payload() data: { promotionId: string; restaurantId: string; productId: string },
  ) {
    await this.adsEngine.logImpression(data.promotionId, data.restaurantId, data.productId);
    return { success: true };
  }

  @MessagePattern('promotions.logClick')
  async logClick(
    @Payload() data: { promotionId: string; restaurantId: string; productId: string },
  ) {
    await this.adsEngine.logClick(data.promotionId, data.restaurantId, data.productId);
    return { success: true };
  }
}

