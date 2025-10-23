import { Module } from '@nestjs/common';
import { AdsEngineService } from './ads-engine.service';

@Module({
  providers: [AdsEngineService],
  exports: [AdsEngineService],
})
export class AdsModule {}

