import { Module } from '@nestjs/common';
import { PromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';
import { PromotionsHandlers } from './promotions.handlers';
import { AdsModule } from '../ads/ads.module';

@Module({
  imports: [AdsModule],
  controllers: [PromotionsController, PromotionsHandlers],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}

