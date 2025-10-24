import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

const MAX_PINS_PER_SUPPLIER = 200;

interface PinCacheData {
  productId: string;
  sortIndex: number;
  note: string | null;
}

/**
 * Pinned Products Service
 * Manages restaurant-scoped, supplier-scoped product pins with Redis caching
 */
@Injectable()
export class PinsService {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: 3,
    });
  }

  /**
   * Get cache key for pins
   */
  private getCacheKey(restaurantId: string, supplierId: string): string {
    return `pins:v1:${restaurantId}:${supplierId}`;
  }

  /**
   * Invalidate cache for a restaurant-supplier scope
   */
  private async invalidateCache(restaurantId: string, supplierId: string): Promise<void> {
    const key = this.getCacheKey(restaurantId, supplierId);
    await this.redis.del(key);
  }

  /**
   * Get pinned products from cache or DB
   */
  async getPinnedProducts(restaurantId: string, supplierId: string) {
    // Try cache first
    const cacheKey = this.getCacheKey(restaurantId, supplierId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      const pins = JSON.parse(cached) as PinCacheData[];
      // Also fetch full records for response
      const fullPins = await this.prisma.pinnedProduct.findMany({
        where: {
          restaurantId,
          supplierId,
        },
        orderBy: {
          sortIndex: 'asc',
        },
      });
      return fullPins;
    }

    // Cache miss - fetch from DB
    const pins = await this.prisma.pinnedProduct.findMany({
      where: {
        restaurantId,
        supplierId,
      },
      orderBy: {
        sortIndex: 'asc',
      },
    });

    // Populate cache
    if (pins.length > 0) {
      const cacheData: PinCacheData[] = pins.map(p => ({
        productId: p.productId,
        sortIndex: p.sortIndex,
        note: p.note,
      }));

      await this.redis.setex(
        cacheKey,
        86400, // 24 hours TTL
        JSON.stringify(cacheData),
      );
    }

    return pins;
  }

  /**
   * Pin a product (or update note if already pinned)
   */
  async pinProduct(
    restaurantId: string,
    supplierId: string,
    productId: string,
    note?: string,
  ) {
    // Check if already pinned
    const existing = await this.prisma.pinnedProduct.findUnique({
      where: {
        restaurantId_supplierId_productId: {
          restaurantId,
          supplierId,
          productId,
        },
      },
    });

    if (existing) {
      // Update note if provided
      if (note !== undefined) {
        const updated = await this.prisma.pinnedProduct.update({
          where: { id: existing.id },
          data: { note, updatedAt: new Date() },
        });

        await this.invalidateCache(restaurantId, supplierId);
        return updated;
      }
      return existing;
    }

    // Check max pins limit
    const currentCount = await this.prisma.pinnedProduct.count({
      where: { restaurantId, supplierId },
    });

    if (currentCount >= MAX_PINS_PER_SUPPLIER) {
      throw new BadRequestException(
        `Maximum ${MAX_PINS_PER_SUPPLIER} pins per supplier reached`,
      );
    }

    // Get next sortIndex
    const maxSortIndex = await this.prisma.pinnedProduct.aggregate({
      where: { restaurantId, supplierId },
      _max: { sortIndex: true },
    });

    const nextSortIndex = (maxSortIndex._max.sortIndex ?? -1) + 1;

    // Create pin
    const pin = await this.prisma.pinnedProduct.create({
      data: {
        restaurantId,
        supplierId,
        productId,
        sortIndex: nextSortIndex,
        note,
      },
    });

    await this.invalidateCache(restaurantId, supplierId);

    return pin;
  }

  /**
   * Unpin a product
   */
  async unpinProduct(
    restaurantId: string,
    supplierId: string,
    productId: string,
  ): Promise<boolean> {
    const deleted = await this.prisma.pinnedProduct.deleteMany({
      where: {
        restaurantId,
        supplierId,
        productId,
      },
    });

    if (deleted.count > 0) {
      await this.invalidateCache(restaurantId, supplierId);
      return true;
    }

    return false;
  }

  /**
   * Reorder pinned products
   * productIdsInOrder should be the complete ordered list
   */
  async reorderPinnedProducts(
    restaurantId: string,
    supplierId: string,
    productIdsInOrder: string[],
  ) {
    // Verify all products are actually pinned
    const existingPins = await this.prisma.pinnedProduct.findMany({
      where: {
        restaurantId,
        supplierId,
        productId: { in: productIdsInOrder },
      },
    });

    if (existingPins.length !== productIdsInOrder.length) {
      throw new BadRequestException('Some products are not pinned');
    }

    // Update sortIndex for each in a transaction
    await this.prisma.$transaction(
      productIdsInOrder.map((productId, index) =>
        this.prisma.pinnedProduct.updateMany({
          where: {
            restaurantId,
            supplierId,
            productId,
          },
          data: {
            sortIndex: index,
            updatedAt: new Date(),
          },
        }),
      ),
    );

    await this.invalidateCache(restaurantId, supplierId);

    // Return updated pins
    return this.getPinnedProducts(restaurantId, supplierId);
  }

  /**
   * Update pin note
   */
  async updatePinNote(id: string, restaurantId: string, note: string) {
    const pin = await this.prisma.pinnedProduct.findUnique({
      where: { id },
    });

    if (!pin || pin.restaurantId !== restaurantId) {
      throw new BadRequestException('Pin not found or unauthorized');
    }

    const updated = await this.prisma.pinnedProduct.update({
      where: { id },
      data: { note, updatedAt: new Date() },
    });

    await this.invalidateCache(restaurantId, pin.supplierId);

    return updated;
  }

  /**
   * Get pinned product IDs for merging with supplier products
   */
  async getPinnedProductIds(
    restaurantId: string,
    supplierId: string,
  ): Promise<string[]> {
    const pins = await this.getPinnedProducts(restaurantId, supplierId);
    return pins.map(p => p.productId);
  }

  /**
   * Get pins data for merging (includes sortIndex for ordering)
   */
  async getPinsForMerge(
    restaurantId: string,
    supplierId: string,
  ): Promise<Map<string, { sortIndex: number; note: string | null }>> {
    const pins = await this.getPinnedProducts(restaurantId, supplierId);
    const map = new Map<string, { sortIndex: number; note: string | null }>();

    pins.forEach(pin => {
      map.set(pin.productId, {
        sortIndex: pin.sortIndex,
        note: pin.note,
      });
    });

    return map;
  }
}

