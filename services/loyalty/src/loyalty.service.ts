import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { createLogger } from '@supplify/utils';

const logger = createLogger('loyalty-service');

@Injectable()
export class LoyaltyService {
  constructor(private prisma: PrismaService) {}

  async getLoyaltyWallets(restaurantId: string) {
    const wallets = await this.prisma.loyaltyWallet.findMany({
      where: { restaurantId },
      include: {
        program: true,
      },
    });

    return wallets.map(wallet => ({
      supplierId: wallet.supplierId,
      supplierName: `Supplier ${wallet.supplierId}`, // TODO: Fetch actual supplier name
      points: wallet.points,
      redeemRate: Number(wallet.program?.redeemRate || 0.01),
      earnRate: Number(wallet.program?.earnRate || 0.1),
    }));
  }

  async getLoyaltyPrograms() {
    return this.prisma.loyaltyProgram.findMany({
      where: { active: true },
    });
  }

  async createLoyaltyProgram(supplierId: string, data: {
    name: string;
    earnRate: number;
    redeemRate: number;
    minRedeem: number;
  }) {
    return this.prisma.loyaltyProgram.create({
      data: {
        supplierId,
        name: data.name,
        earnRate: data.earnRate,
        redeemRate: data.redeemRate,
        minRedeem: data.minRedeem,
      },
    });
  }

  async getOrCreateWallet(supplierId: string, restaurantId: string) {
    let wallet = await this.prisma.loyaltyWallet.findUnique({
      where: {
        supplierId_restaurantId: {
          supplierId,
          restaurantId,
        },
      },
    });

    if (!wallet) {
      wallet = await this.prisma.loyaltyWallet.create({
        data: {
          supplierId,
          restaurantId,
          points: 0,
        },
      });
    }

    return wallet;
  }

  async earnPoints(supplierId: string, restaurantId: string, orderId: string, totalAmount: number) {
    // Check if supplier has an active loyalty program
    const program = await this.prisma.loyaltyProgram.findFirst({
      where: {
        supplierId,
        active: true,
      },
    });

    if (!program) {
      logger.info(`No active loyalty program found for supplier ${supplierId}`);
      return null;
    }

    const points = Math.floor(totalAmount * Number(program.earnRate));
    if (points <= 0) return null;

    const wallet = await this.getOrCreateWallet(supplierId, restaurantId);

    // Update wallet points
    const updatedWallet = await this.prisma.loyaltyWallet.update({
      where: { id: wallet.id },
      data: {
        points: wallet.points + points,
      },
    });

    // Create transaction record
    await this.prisma.loyaltyTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'EARN',
        points,
        orderId,
        meta: {
          totalAmount,
          earnRate: Number(program.earnRate),
        },
      },
    });

    logger.info(`Earned ${points} points for restaurant ${restaurantId} from supplier ${supplierId}`);
    return updatedWallet;
  }

  async redeemPoints(supplierId: string, restaurantId: string, orderId: string, points: number) {
    const wallet = await this.getOrCreateWallet(supplierId, restaurantId);
    
    if (wallet.points < points) {
      throw new Error('Insufficient loyalty points');
    }

    const program = await this.prisma.loyaltyProgram.findFirst({
      where: {
        supplierId,
        active: true,
      },
    });

    if (!program) {
      throw new Error('No active loyalty program found');
    }

    if (points < program.minRedeem) {
      throw new Error(`Minimum redemption is ${program.minRedeem} points`);
    }

    const discountAmount = points * Number(program.redeemRate);

    // Update wallet points
    await this.prisma.loyaltyWallet.update({
      where: { id: wallet.id },
      data: {
        points: wallet.points - points,
      },
    });

    // Create transaction record
    await this.prisma.loyaltyTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'REDEEM',
        points: -points,
        orderId,
        meta: {
          discountAmount,
          redeemRate: Number(program.redeemRate),
        },
      },
    });

    logger.info(`Redeemed ${points} points for restaurant ${restaurantId} from supplier ${supplierId}`);
    return {
      success: true,
      discountAmount,
      remainingPoints: wallet.points - points,
    };
  }

  async getTotalLoyaltyPoints(restaurantId: string): Promise<number> {
    const wallets = await this.prisma.loyaltyWallet.findMany({
      where: { restaurantId },
    });

    return wallets.reduce((total, wallet) => total + wallet.points, 0);
  }
}
