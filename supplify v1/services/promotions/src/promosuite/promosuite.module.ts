import { Module } from '@nestjs/common';
import { PromoSuiteService } from './promosuite.service';

@Module({
  providers: [PromoSuiteService],
  exports: [PromoSuiteService],
})
export class PromoSuiteModule {}
