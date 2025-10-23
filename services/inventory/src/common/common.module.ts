import { Module } from '@nestjs/common';
import { UomService } from './uom.service';
import { FefoService } from './fefo.service';
import { ValuationService } from './valuation.service';

@Module({
  providers: [UomService, FefoService, ValuationService],
  exports: [UomService, FefoService, ValuationService],
})
export class CommonModule {}

