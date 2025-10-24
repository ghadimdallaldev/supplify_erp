import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { createLogger } from '@supplify/utils';

const logger = createLogger('suppliers-service');

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async getRestaurantSuppliers(restaurantId: string) {
    const restaurantSuppliers = await this.prisma.restaurantSupplier.findMany({
      where: { restaurantId },
      orderBy: [
        { pinned: 'desc' },
        { featured: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return restaurantSuppliers.map(rs => ({
      id: rs.id,
      restaurantId: rs.restaurantId,
      supplierId: rs.supplierId,
      supplierName: `Supplier ${rs.supplierId}`, // TODO: Fetch actual supplier name
      pinned: rs.pinned,
      featured: rs.featured,
      createdAt: rs.createdAt.toISOString(),
    }));
  }

  async addSupplier(restaurantId: string, supplierId: string) {
    // Check if supplier already exists
    const existing = await this.prisma.restaurantSupplier.findUnique({
      where: {
        restaurantId_supplierId: {
          restaurantId,
          supplierId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    // Create new supplier relationship
    const restaurantSupplier = await this.prisma.restaurantSupplier.create({
      data: {
        restaurantId,
        supplierId,
        pinned: false,
        featured: false,
      },
    });

    logger.info(`Added supplier ${supplierId} to restaurant ${restaurantId}`);
    return restaurantSupplier;
  }

  async pinSupplier(restaurantId: string, supplierId: string, pinned: boolean) {
    const restaurantSupplier = await this.prisma.restaurantSupplier.update({
      where: {
        restaurantId_supplierId: {
          restaurantId,
          supplierId,
        },
      },
      data: { pinned },
    });

    logger.info(`Updated pin status for supplier ${supplierId} in restaurant ${restaurantId}: ${pinned}`);
    return restaurantSupplier;
  }

  async featureSupplier(restaurantId: string, supplierId: string, featured: boolean) {
    const restaurantSupplier = await this.prisma.restaurantSupplier.update({
      where: {
        restaurantId_supplierId: {
          restaurantId,
          supplierId,
        },
      },
      data: { featured },
    });

    logger.info(`Updated feature status for supplier ${supplierId} in restaurant ${restaurantId}: ${featured}`);
    return restaurantSupplier;
  }

  async getAllSuppliers() {
    // This would typically fetch from a suppliers service
    // For now, return mock data
    return [
      { id: 'supplier_1', name: 'Fresh Produce Co.', active: true },
      { id: 'supplier_2', name: 'Dairy Direct', active: true },
      { id: 'supplier_3', name: 'Meat & Poultry Ltd', active: true },
    ];
  }
}
