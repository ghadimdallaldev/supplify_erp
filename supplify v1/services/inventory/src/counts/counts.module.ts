import { Module } from '@nestjs/common';
import { CountsController } from './counts.controller';
import { CountsService } from './counts.service';
import { CommonModule } from '../common/common.module';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [CommonModule, MovementsModule],
  controllers: [CountsController],
  providers: [CountsService],
  exports: [CountsService],
})
export class CountsModule {}

