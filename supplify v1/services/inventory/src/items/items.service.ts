import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Items Service
 * Manages inventory items and stock queries
 */
@Injectable()
export class ItemsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get all items for a restaurant
   */
  async getItems(restaurantId: string, filters?: {
    active?: boolean;
    categoryId?: string;
    storageType?: string;
    search?: string;
  }) {
    return this.prisma.item.findMany({
      where: {
        restaurantId,
        active: filters?.active,
        categoryId: filters?.categoryId,
        storageType: filters?.storageType as any,
        OR: filters?.search
          ? [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { sku: { contains: filters.search, mode: 'insensitive' } },
              { barcode: { contains: filters.search, mode: 'insensitive' } },
            ]
          : undefined,
      },
      include: {
        stockOnHand: {
          include: { location: true },
        },
        parConfigs: {
          include: { location: true },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  /**
   * Get item by ID with full details
   */
  async getItem(itemId: string) {
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      include: {
        stockOnHand: {
          include: { location: true },
        },
        batches: {
          where: { qtyOnHandBase: { gt: 0 } },
          include: { location: true },
          orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
        },
        supplierLinks: true,
        parConfigs: {
          include: { location: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  /**
   * Get item by barcode
   */
  async getItemByBarcode(barcode: string, restaurantId: string) {
    const item = await this.prisma.item.findFirst({
      where: {
        barcode,
        restaurantId,
        active: true,
      },
      include: {
        stockOnHand: {
          include: { location: true },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Item with barcode ${barcode} not found`);
    }

    return item;
  }

  /**
   * Get stock on hand for an item at a location
   */
  async getStockOnHand(itemId: string, locationId: string) {
    const soh = await this.prisma.stockOnHand.findUnique({
      where: {
        itemId_locationId: { itemId, locationId },
      },
      include: {
        item: true,
        location: true,
      },
    });

    if (!soh) {
      throw new NotFoundException('Stock on hand not found');
    }

    return soh;
  }

  /**
   * Get batches for an item at a location
   */
  async getBatches(itemId: string, locationId: string) {
    return this.prisma.batch.findMany({
      where: {
        itemId,
        locationId,
        qtyOnHandBase: { gt: 0 },
      },
      orderBy: [
        { expiryDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Get stock ledger (movement history)
   */
  async getLedger(itemId: string, locationId?: string, limit = 50) {
    return this.prisma.stockLedger.findMany({
      where: {
        itemId,
        locationId,
      },
      include: {
        location: true,
        batch: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });
  }

  /**
   * Get par configuration
   */
  async getParConfig(itemId: string, locationId: string) {
    return this.prisma.parConfig.findUnique({
      where: {
        itemId_locationId: { itemId, locationId },
      },
    });
  }

  /**
   * Set or update par configuration
   */
  async setParConfig(data: {
    itemId: string;
    locationId: string;
    minPar: number;
    maxPar: number;
    reorderPoint: number;
    reorderQty: number;
    safetyStock?: number;
  }) {
    return this.prisma.parConfig.upsert({
      where: {
        itemId_locationId: {
          itemId: data.itemId,
          locationId: data.locationId,
        },
      },
      create: data,
      update: {
        minPar: data.minPar,
        maxPar: data.maxPar,
        reorderPoint: data.reorderPoint,
        reorderQty: data.reorderQty,
        safetyStock: data.safetyStock,
      },
    });
  }

  /**
   * Get items below par (for replenishment)
   */
  async getItemsBelowPar(restaurantId: string, locationId?: string) {
    const stockOnHand = await this.prisma.stockOnHand.findMany({
      where: {
        restaurantId,
        locationId,
      },
      include: {
        item: {
          include: {
            supplierLinks: {
              where: { preferred: true },
            },
          },
        },
        location: true,
      },
    });

    // Filter to items below reorder point
    const itemsBelowPar = [];
    
    for (const soh of stockOnHand) {
      const parConfig = await this.prisma.parConfig.findUnique({
        where: {
          itemId_locationId: {
            itemId: soh.itemId,
            locationId: soh.locationId,
          },
        },
      });

      if (parConfig && soh.qtyAvailableBase <= parConfig.reorderPoint) {
        itemsBelowPar.push({
          ...soh,
          parConfig,
          qtyToOrder: parConfig.maxPar - soh.qtyAvailableBase,
        });
      }
    }

    return itemsBelowPar;
  }
}

