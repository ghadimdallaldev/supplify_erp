import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';

@Injectable()
export class OrderInventoryService {
  constructor(
    private prisma: PrismaService,
    private movementsService: MovementsService,
  ) {}

  /**
   * Process order delivery and update inventory
   * This is called when an order status changes to 'DELIVERED'
   */
  async processOrderDelivery(orderId: string, restaurantId: string) {
    try {
      // Get order details from orders service
      // For now, we'll simulate this with mock data
      // In a real implementation, this would be called via events or API
      
      console.log(`Processing inventory update for delivered order: ${orderId}`);
      
      // This would typically:
      // 1. Fetch order items from orders service
      // 2. Create receipt movements for each item
      // 3. Update stock on hand
      // 4. Create batches if needed
      
      // For now, we'll create a placeholder implementation
      await this.createReceiptMovement(orderId, restaurantId);
      
      return { success: true, message: 'Inventory updated successfully' };
    } catch (error) {
      console.error('Error processing order delivery:', error);
      throw error;
    }
  }

  /**
   * Create receipt movement for delivered order
   */
  private async createReceiptMovement(orderId: string, restaurantId: string) {
    // Get default location for the restaurant
    const defaultLocation = await this.prisma.location.findFirst({
      where: { restaurantId, active: true },
    });

    if (!defaultLocation) {
      throw new Error('No active location found for restaurant');
    }

    // For now, we'll create a mock receipt movement
    // In a real implementation, this would process actual order items
    const mockItems = [
      { itemId: 'mock-item-1', qty: 10, unitCost: 5.50 },
      { itemId: 'mock-item-2', qty: 5, unitCost: 12.99 },
    ];

    for (const item of mockItems) {
      await this.movementsService.receiveStock({
        itemId: item.itemId,
        locationId: defaultLocation.id,
        qty: item.qty,
        uom: 'each',
        unitCost: item.unitCost,
        refType: 'ORDER',
        refId: orderId,
        causedBy: 'SYSTEM',
        reason: `Order delivery: ${orderId}`,
        metadata: {
          orderId,
          deliveryDate: new Date().toISOString(),
        },
        idempotencyKey: `order-${orderId}-${item.itemId}`,
      });
    }
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
        totalValue: soh.totalValue,
        location: soh.location.name,
      })),
    };
  }
}
