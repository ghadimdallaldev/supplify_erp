import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  controllers: [AnalyticsController],
  providers: [PrismaService],
})
export class AppModule {}

