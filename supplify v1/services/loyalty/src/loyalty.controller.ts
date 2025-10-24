import { Controller, Get, Post, Body } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { LOYALTY_TIERS } from '@supplify/config';
import { PrismaService } from './prisma.service';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

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
  async handleOrderDelivered(data: { orderId: string; restaurantId: string; supplierId: string; total: number }) {
    await this.loyaltyService.earnPoints(data.supplierId, data.restaurantId, data.orderId, data.total);
  }

  @MessagePattern('loyalty.wallets')
  async getLoyaltyWallets(@Payload() data: { restaurantId: string }) {
    return this.loyaltyService.getLoyaltyWallets(data.restaurantId);
  }

  @MessagePattern('loyalty.programs')
  async getLoyaltyPrograms() {
    return this.loyaltyService.getLoyaltyPrograms();
  }

  @MessagePattern('loyalty.redeem')
  async redeemLoyaltyPoints(@Payload() data: { restaurantId: string; supplierId: string; points: number; orderId: string }) {
    return this.loyaltyService.redeemPoints(data.supplierId, data.restaurantId, data.orderId, data.points);
  }

  @MessagePattern('loyalty.total')
  async getTotalLoyaltyPoints(@Payload() data: { restaurantId: string }) {
    const total = await this.loyaltyService.getTotalLoyaltyPoints(data.restaurantId);
    return { total };
  }

  private calculateTier(points: number): 'BRONZE' | 'SILVER' | 'GOLD' {
    if (points >= LOYALTY_TIERS.GOLD.minPoints) return 'GOLD';
    if (points >= LOYALTY_TIERS.SILVER.minPoints) return 'SILVER';
    return 'BRONZE';
  }
}

