import { Controller, Get, Post, Body } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { LOYALTY_TIERS } from '@supplify/config';
import { PrismaService } from './prisma.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private prisma: PrismaService) {}

  @Get('balance/:entityId')
  async getBalance(@Body() body: { entityId: string }) {
    const ledger = await this.prisma.pointsLedger.findMany({
      where: { entityId: body.entityId },
    });

    const totalPoints = ledger.reduce((sum, entry) => sum + entry.delta, 0);
    const tier = this.calculateTier(totalPoints);

    return { totalPoints, tier, multiplier: LOYALTY_TIERS[tier].multiplier };
  }

  @Post('accrue')
  async accruePoints(@Body() body: { entityId: string; points: number; reason: string; orderId?: string }) {
    return this.prisma.pointsLedger.create({
      data: {
        entityId: body.entityId,
        entityType: 'RESTAURANT',
        delta: body.points,
        reason: body.reason,
        orderId: body.orderId,
      },
    });
  }

  @EventPattern('order.delivered')
  async handleOrderDelivered(data: { orderId: string; restaurantId: string; total: number }) {
    const points = Math.floor(data.total / 10); // 1 point per $10
    await this.accruePoints({
      entityId: data.restaurantId,
      points,
      reason: 'Order delivered',
      orderId: data.orderId,
    });
  }

  private calculateTier(points: number): 'BRONZE' | 'SILVER' | 'GOLD' {
    if (points >= LOYALTY_TIERS.GOLD.minPoints) return 'GOLD';
    if (points >= LOYALTY_TIERS.SILVER.minPoints) return 'SILVER';
    return 'BRONZE';
  }
}

