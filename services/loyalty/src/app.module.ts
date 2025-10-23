import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LoyaltyController } from './loyalty.controller';

@Module({
  controllers: [LoyaltyController],
  providers: [PrismaService],
})
export class AppModule {}

