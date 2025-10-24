import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private prisma: PrismaService) {}

  @Get('restaurant/spend-by-supplier')
  async getSpendBySupplier(@Query('restaurantId') restaurantId: string, @Query('period') period = '2024-01') {
    return this.prisma.spendBySupplier.findMany({
      where: { restaurantId, period },
    });
  }

  @Get('restaurant/top-items')
  async getTopItems(@Query('restaurantId') restaurantId: string, @Query('period') period = '2024-01') {
    return this.prisma.topItem.findMany({
      where: { restaurantId, period },
      take: 10,
      orderBy: { totalSpend: 'desc' },
    });
  }

  @Get('restaurant/summary')
  async getRestaurantSummary(@Query('restaurantId') restaurantId: string) {
    const spendData = await this.prisma.spendBySupplier.findMany({
      where: { restaurantId },
    });

    const totalSpend = spendData.reduce((sum, s) => sum + Number(s.totalSpend), 0);
    const orderCount = spendData.reduce((sum, s) => sum + s.orderCount, 0);

    return {
      restaurantId,
      totalSpend,
      orderCount,
      spendBySupplier: spendData.slice(0, 5),
    };
  }
}

