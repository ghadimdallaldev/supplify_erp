import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  controllers: [LoyaltyController],
  providers: [PrismaService, LoyaltyService],
})
export class AppModule {}

