import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ValuationMethod } from '@prisma/client';

export interface ValuationResult {
  method: ValuationMethod;
  totalValue: number;
  itemValuations: Array<{
    itemId: string;
    itemName: string;
    locationId: string;
    locationName: string;
    qty: number;
    unitCost: number;
    totalCost: number;
  }>;
}

/**
 * Valuation Service
 * Calculates inventory value using FIFO or Weighted Average methods
 */
@Injectable()
export class ValuationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Calculate inventory valuation for a restaurant
   */
  async calculateValuation(
    restaurantId: string,
    method: ValuationMethod,
    asOfDate?: Date,
  ): Promise<ValuationResult> {
    if (method === ValuationMethod.WAVG) {
      return this.calculateWeightedAverage(restaurantId, asOfDate);
    } else {
      return this.calculateFIFO(restaurantId, asOfDate);
    }
  }

  /**
   * Weighted Average Cost valuation
   * Uses the current average cost from StockOnHand
   */
  private async calculateWeightedAverage(
    restaurantId: string,
    asOfDate?: Date,
  ): Promise<ValuationResult> {
    const stockOnHand = await this.prisma.stockOnHand.findMany({
      where: {
        restaurantId,
        qtyOnHandBase: { gt: 0 },
      },
      include: {
        item: true,
        location: true,
      },
    });

    const itemValuations = stockOnHand.map(soh => ({
      itemId: soh.itemId,
      itemName: soh.item.name,
      locationId: soh.locationId,
      locationName: soh.location.name,
      qty: soh.qtyOnHandBase,
      unitCost: soh.avgCost || 0,
      totalCost: soh.totalValue || 0,
    }));

    const totalValue = itemValuations.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      method: ValuationMethod.WAVG,
      totalValue,
      itemValuations,
    };
  }

  /**
   * FIFO (First In, First Out) valuation
   * Values inventory based on the cost of the oldest batches
   */
  private async calculateFIFO(
    restaurantId: string,
    asOfDate?: Date,
  ): Promise<ValuationResult> {
    // Get all batches with remaining quantity
    const batches = await this.prisma.batch.findMany({
      where: {
        qtyOnHandBase: { gt: 0 },
        item: { restaurantId },
      },
      include: {
        item: true,
        location: true,
      },
      orderBy: {
        createdAt: 'asc', // FIFO order
      },
    });

    // Group by item+location
    const groupedValuations = new Map<string, {
      itemId: string;
      itemName: string;
      locationId: string;
      locationName: string;
      qty: number;
      totalCost: number;
    }>();

    for (const batch of batches) {
      const key = `${batch.itemId}-${batch.locationId}`;
      const existing = groupedValuations.get(key);

      if (existing) {
        existing.qty += batch.qtyOnHandBase;
        existing.totalCost += batch.qtyOnHandBase * batch.lastUnitCost;
      } else {
        groupedValuations.set(key, {
          itemId: batch.itemId,
          itemName: batch.item.name,
          locationId: batch.locationId,
          locationName: batch.location.name,
          qty: batch.qtyOnHandBase,
          totalCost: batch.qtyOnHandBase * batch.lastUnitCost,
        });
      }
    }

    const itemValuations = Array.from(groupedValuations.values()).map(val => ({
      ...val,
      unitCost: val.qty > 0 ? val.totalCost / val.qty : 0,
    }));

    const totalValue = itemValuations.reduce((sum, item) => sum + item.totalCost, 0);

    return {
      method: ValuationMethod.FIFO,
      totalValue,
      itemValuations,
    };
  }

  /**
   * Create a valuation snapshot for reporting
   */
  async createSnapshot(restaurantId: string, method: ValuationMethod) {
    const valuation = await this.calculateValuation(restaurantId, method);

    return this.prisma.valuationSnapshot.create({
      data: {
        restaurantId,
        atDate: new Date(),
        method,
        totalValue: valuation.totalValue,
        details: valuation.itemValuations,
      },
    });
  }

  /**
   * Calculate weighted average cost when receiving new stock
   */
  calculateWeightedAvgCost(
    currentQty: number,
    currentAvgCost: number,
    newQty: number,
    newUnitCost: number,
  ): number {
    if (currentQty + newQty === 0) return 0;
    
    const currentValue = currentQty * currentAvgCost;
    const newValue = newQty * newUnitCost;
    
    return (currentValue + newValue) / (currentQty + newQty);
  }
}

