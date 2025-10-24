import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementType, StorageType } from '@prisma/client';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface ProcessOrderDeliveryRequest {
  orderId: string;
  restaurantId: string;
  supplierId: string;
  items: OrderItem[];
  deliveredAt: Date;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Process order delivery and update inventory
   * This is called when an order status changes to 'DELIVERED'
   */
  async processOrderDelivery(request: ProcessOrderDeliveryRequest) {
    this.logger.log(`Processing inventory update for delivered order: ${request.orderId}`);

    try {
      // Get or create default location for the restaurant
      const location = await this.getOrCreateDefaultLocation(request.restaurantId);

      // Process each order item
      for (const orderItem of request.items) {
        await this.processOrderItem(orderItem, request, location.id);
      }

      this.logger.log(`Successfully processed ${request.items.length} items for order ${request.orderId}`);
      
      return {
        success: true,
        message: `Inventory updated for ${request.items.length} items`,
        orderId: request.orderId,
      };
    } catch (error) {
      this.logger.error(`Failed to process order delivery for ${request.orderId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single order item
   */
  private async processOrderItem(orderItem: OrderItem, request: ProcessOrderDeliveryRequest, locationId: string) {
    try {
      // Find or create the item in the restaurant's catalog
      let item = await this.findOrCreateItem(orderItem, request.restaurantId);

      // Create stock ledger entry for the receipt
      await this.createReceiptLedgerEntry(item.id, orderItem, request, locationId);

      // Update stock on hand
      await this.updateStockOnHand(item.id, locationId, request.restaurantId, orderItem);

      this.logger.log(`Processed item: ${orderItem.productName} (${orderItem.quantity} units)`);
    } catch (error) {
      this.logger.error(`Failed to process item ${orderItem.productName}:`, error);
      throw error;
    }
  }

  /**
   * Find existing item or create new one
   */
  private async findOrCreateItem(orderItem: OrderItem, restaurantId: string) {
    // Try to find existing item by name
    let item = await this.prisma.item.findFirst({
      where: {
        restaurantId,
        name: orderItem.productName,
      },
    });

    if (!item) {
      // Create new item
      item = await this.prisma.item.create({
        data: {
          restaurantId,
          name: orderItem.productName,
          sku: `SKU-${orderItem.productId}`,
          storageType: StorageType.DRY, // Default storage type
          uomBase: 'each', // Default unit
          active: true,
        },
      });

      this.logger.log(`Created new item: ${orderItem.productName} (ID: ${item.id})`);
    }

    return item;
  }

  /**
   * Create receipt ledger entry
   */
  private async createReceiptLedgerEntry(itemId: string, orderItem: OrderItem, request: ProcessOrderDeliveryRequest, locationId: string) {
    const ledgerEntry = await this.prisma.stockLedger.create({
      data: {
        itemId,
        restaurantId: request.restaurantId,
        locationId,
        movementType: MovementType.RECEIPT,
        qtyBase: orderItem.quantity,
        uomBase: 'each',
        unitCost: orderItem.unitPrice,
        extCost: orderItem.quantity * orderItem.unitPrice,
        refType: 'ORDER',
        refId: request.orderId,
        causedBy: 'SYSTEM',
        reason: `Receipt from order ${request.orderId}`,
        metadata: {
          orderId: request.orderId,
          supplierId: request.supplierId,
          productId: orderItem.productId,
          productName: orderItem.productName,
          deliveredAt: request.deliveredAt.toISOString(),
        },
        idempotencyKey: `${request.orderId}-${orderItem.productId}`,
      },
    });

    this.logger.log(`Created ledger entry: ${ledgerEntry.id}`);
    return ledgerEntry;
  }

  /**
   * Update stock on hand
   */
  private async updateStockOnHand(itemId: string, locationId: string, restaurantId: string, orderItem: OrderItem) {
    const existingStock = await this.prisma.stockOnHand.findUnique({
      where: {
        itemId_locationId: {
          itemId,
          locationId,
        },
      },
    });

    if (existingStock) {
      // Update existing stock
      const newQtyOnHand = existingStock.qtyOnHandBase + orderItem.quantity;
      const newQtyAvailable = existingStock.qtyAvailableBase + orderItem.quantity;
      
      // Calculate new average cost
      const totalCost = (existingStock.avgCost * existingStock.qtyOnHandBase) + (orderItem.unitPrice * orderItem.quantity);
      const newAvgCost = totalCost / newQtyOnHand;

      await this.prisma.stockOnHand.update({
        where: {
          itemId_locationId: {
            itemId,
            locationId,
          },
        },
        data: {
          qtyOnHandBase: newQtyOnHand,
          qtyAvailableBase: newQtyAvailable,
          lastCost: orderItem.unitPrice,
          avgCost: newAvgCost,
          totalValue: newQtyOnHand * newAvgCost,
          lastMovementAt: new Date(),
        },
      });

      this.logger.log(`Updated existing stock: ${orderItem.productName} (${newQtyOnHand} units)`);
    } else {
      // Create new stock record
      await this.prisma.stockOnHand.create({
        data: {
          itemId,
          locationId,
          restaurantId,
          qtyOnHandBase: orderItem.quantity,
          qtyCommittedBase: 0,
          qtyAvailableBase: orderItem.quantity,
          lastCost: orderItem.unitPrice,
          avgCost: orderItem.unitPrice,
          totalValue: orderItem.quantity * orderItem.unitPrice,
          lastMovementAt: new Date(),
        },
      });

      this.logger.log(`Created new stock record: ${orderItem.productName} (${orderItem.quantity} units)`);
    }
  }

  /**
   * Get or create default location
   */
  private async getOrCreateDefaultLocation(restaurantId: string) {
    let location = await this.prisma.location.findFirst({
      where: {
        restaurantId,
        active: true,
      },
    });

    if (!location) {
      location = await this.prisma.location.create({
        data: {
          restaurantId,
          name: 'Main Storage',
          code: 'MAIN',
          active: true,
        },
      });

      this.logger.log(`Created default location for restaurant ${restaurantId}`);
    }

    return location;
  }

  /**
   * Get inventory summary for a restaurant
   */
  async getInventorySummary(restaurantId: string) {
    const stockOnHand = await this.prisma.stockOnHand.findMany({
      where: { restaurantId },
      include: {
        item: true,
        location: true,
      },
    });

    const totalValue = stockOnHand.reduce((sum, soh) => {
      return sum + (soh.totalValue || 0);
    }, 0);

    return {
      totalItems: stockOnHand.length,
      totalValue,
      items: stockOnHand.map(soh => ({
        id: soh.itemId,
        name: soh.item.name,
        sku: soh.item.sku,
        qtyOnHand: soh.qtyOnHandBase,
        qtyAvailable: soh.qtyAvailableBase,
        unitCost: soh.lastCost,
        avgCost: soh.avgCost,
        totalValue: soh.totalValue,
        location: soh.location.name,
        category: soh.item.categoryId,
        lastMovementAt: soh.lastMovementAt,
      })),
    };
  }

  /**
   * Get recent inventory activity
   */
  async getRecentActivity(restaurantId: string, limit: number = 10) {
    const recentMovements = await this.prisma.stockLedger.findMany({
      where: { restaurantId },
      include: {
        item: true,
        location: true,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return recentMovements.map(movement => ({
      id: movement.id,
      itemName: movement.item.name,
      movementType: movement.movementType,
      quantity: movement.qtyBase,
      unitCost: movement.unitCost,
      totalCost: movement.extCost,
      reason: movement.reason,
      timestamp: movement.timestamp,
      location: movement.location.name,
      metadata: movement.metadata,
    }));
  }

  /**
   * Create manual inventory adjustment
   */
  async createAdjustment(itemId: string, locationId: string, restaurantId: string, adjustment: number, reason: string, userId: string) {
    // Get current stock
    let currentStock = await this.prisma.stockOnHand.findUnique({
      where: {
        itemId_locationId: {
          itemId,
          locationId,
        },
      },
    });

    // If stock doesn't exist, create it with 0 quantity
    if (!currentStock) {
      // Get the item to get its details
      const item = await this.prisma.item.findUnique({
        where: { id: itemId },
      });

      if (!item) {
        throw new Error('Item not found');
      }

      // Create initial stock record
      currentStock = await this.prisma.stockOnHand.create({
        data: {
          itemId,
          restaurantId,
          locationId,
          qtyOnHandBase: 0,
          qtyCommittedBase: 0,
          qtyAvailableBase: 0,
          lastCost: 0,
          avgCost: 0,
          totalValue: 0,
          lastMovementAt: new Date(),
        },
      });
    }

    // Create ledger entry
    await this.prisma.stockLedger.create({
      data: {
        itemId,
        restaurantId,
        locationId,
        movementType: MovementType.ADJUSTMENT,
        qtyBase: adjustment,
        uomBase: 'each',
        unitCost: currentStock.avgCost,
        extCost: adjustment * (currentStock.avgCost || 0),
        refType: 'ADJUSTMENT',
        refId: `adj-${Date.now()}`,
        causedBy: userId,
        reason,
        idempotencyKey: `adj-${itemId}-${locationId}-${Date.now()}`,
      },
    });

    // Update stock on hand
    const newQtyOnHand = currentStock.qtyOnHandBase + adjustment;
    const newQtyAvailable = currentStock.qtyAvailableBase + adjustment;

    await this.prisma.stockOnHand.update({
      where: {
        itemId_locationId: {
          itemId,
          locationId,
        },
      },
      data: {
        qtyOnHandBase: newQtyOnHand,
        qtyAvailableBase: newQtyAvailable,
        totalValue: newQtyOnHand * (currentStock.avgCost || 0),
        lastMovementAt: new Date(),
      },
    });

    this.logger.log(`Created adjustment: ${adjustment} units for item ${itemId}`);
  }
}
