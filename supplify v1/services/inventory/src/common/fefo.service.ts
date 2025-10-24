import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Batch, BatchStatus } from '@prisma/client';

export interface BatchAllocation {
  batch: Batch;
  qtyAllocated: number;
}

/**
 * FEFO (First Expiry, First Out) Service
 * Selects batches for consumption based on expiry dates
 */
@Injectable()
export class FefoService {
  constructor(private prisma: PrismaService) {}

  /**
   * Select batches to fulfill a quantity requirement using FEFO logic
   * 
   * @param itemId - Item to select batches for
   * @param locationId - Location to select from
   * @param qtyNeeded - Quantity needed in base UOM
   * @param allowNegative - Allow consuming more than available (emergency mode)
   * @returns Array of batch allocations
   */
  async selectBatches(
    itemId: string,
    locationId: string,
    qtyNeeded: number,
    allowNegative = false,
  ): Promise<BatchAllocation[]> {
    // Get available batches sorted by FEFO rules
    const batches = await this.prisma.batch.findMany({
      where: {
        itemId,
        locationId,
        qtyOnHandBase: allowNegative ? undefined : { gt: 0 },
        status: BatchStatus.OK,
      },
      orderBy: [
        { expiryDate: 'asc' },  // First expiry first
        { createdAt: 'asc' },    // Then FIFO
      ],
    });

    if (batches.length === 0 && !allowNegative) {
      throw new Error(`No available batches for item ${itemId} at location ${locationId}`);
    }

    const allocations: BatchAllocation[] = [];
    let remaining = qtyNeeded;

    for (const batch of batches) {
      if (remaining <= 0) break;

      const availableInBatch = batch.qtyOnHandBase;
      const toAllocate = Math.min(remaining, availableInBatch);

      if (toAllocate > 0 || allowNegative) {
        allocations.push({
          batch,
          qtyAllocated: allowNegative && remaining > availableInBatch ? remaining : toAllocate,
        });

        remaining -= toAllocate;
      }
    }

    if (remaining > 0 && !allowNegative) {
      throw new Error(
        `Insufficient stock: needed ${qtyNeeded}, available ${qtyNeeded - remaining} for item ${itemId}`,
      );
    }

    return allocations;
  }

  /**
   * Get batches expiring within a certain number of days
   */
  async getExpiringBatches(restaurantId: string, withinDays: number, storageType?: string) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + withinDays);

    return this.prisma.batch.findMany({
      where: {
        expiryDate: {
          lte: cutoffDate,
          gte: new Date(),
        },
        qtyOnHandBase: { gt: 0 },
        status: BatchStatus.OK,
        item: {
          restaurantId,
          storageType: storageType as any,
        },
      },
      include: {
        item: true,
        location: true,
      },
      orderBy: {
        expiryDate: 'asc',
      },
    });
  }
}

