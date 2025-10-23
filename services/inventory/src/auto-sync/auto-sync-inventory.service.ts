import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { MovementType, BatchStatus } from '@prisma/client';

export interface OrderLineDispatchedEvent {
  idempotencyKey: string;
  clientId: string;
  orderId: string;
  orderLineId: string;
  supplierId: string;
  restaurantId: string;
  supplierProductId: string;
  restaurantItemId?: string;
  qty: number;
  uom: string;
  expiry?: string;
  lotCode?: string;
  ts: string;
}

export interface OrderLineDeliveredEvent {
  idempotencyKey: string;
  clientId: string;
  orderId: string;
  orderLineId: string;
  supplierId: string;
  restaurantId: string;
  supplierProductId: string;
  restaurantItemId?: string;
  qty: number;
  uom: string;
  expiry?: string;
  lotCode?: string;
  ts: string;
}

@Injectable()
export class AutoSyncInventoryService {
  private readonly logger = new Logger(AutoSyncInventoryService.name);

  constructor(
    private prisma: PrismaService,
    private movementsService: MovementsService,
  ) {}

  @EventPattern('orders.line.dispatched')
  async handleOrderLineDispatched(@Payload() event: OrderLineDispatchedEvent) {
    this.logger.log(`Processing DISPATCHED event for order ${event.orderId}, line ${event.orderLineId}`);
    
    try {
      // Check if auto-sync is enabled for this client
      const settings = await this.getOrganizationSettings(event.clientId);
      if (!settings?.inventoryAutoSyncEnabled) {
        this.logger.log(`Auto-sync disabled for client ${event.clientId}, ignoring event`);
        return;
      }

      // Check if we should process on DISPATCHED
      if (settings.inventoryAutoReceiveMode === 'DISPATCHED') {
        await this.processInventoryUpdate(event, 'DISPATCHED');
      } else {
        // Mode is DELIVERED, create InTransit entry
        await this.createInTransitEntry(event);
      }

      // Record fulfillment event
      await this.recordFulfillmentEvent(event, 'DISPATCHED');
      
    } catch (error) {
      this.logger.error(`Failed to process DISPATCHED event: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  @EventPattern('orders.line.delivered')
  async handleOrderLineDelivered(@Payload() event: OrderLineDeliveredEvent) {
    this.logger.log(`Processing DELIVERED event for order ${event.orderId}, line ${event.orderLineId}`);
    
    try {
      // Check if auto-sync is enabled for this client
      const settings = await this.getOrganizationSettings(event.clientId);
      if (!settings?.inventoryAutoSyncEnabled) {
        this.logger.log(`Auto-sync disabled for client ${event.clientId}, ignoring event`);
        return;
      }

      // Check if we should process on DELIVERED
      if (settings.inventoryAutoReceiveMode === 'DELIVERED') {
        await this.processInventoryUpdate(event, 'DELIVERED');
      } else {
        // Mode is DISPATCHED, move from InTransit to Available
        await this.moveFromInTransitToAvailable(event);
      }

      // Record fulfillment event
      await this.recordFulfillmentEvent(event, 'DELIVERED');
      
    } catch (error) {
      this.logger.error(`Failed to process DELIVERED event: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  private async getOrganizationSettings(clientId: string) {
    return await this.prisma.organizationSettings.findUnique({
      where: { clientId },
    });
  }

  private async processInventoryUpdate(
    event: OrderLineDispatchedEvent | OrderLineDeliveredEvent,
    eventType: 'DISPATCHED' | 'DELIVERED'
  ) {
    // Resolve restaurantItemId if not provided
    let restaurantItemId = event.restaurantItemId;
    if (!restaurantItemId) {
      restaurantItemId = await this.resolveRestaurantItemId(
        event.restaurantId,
        event.supplierProductId
      );
      
      if (!restaurantItemId) {
        this.logger.warn(`No mapping found for supplier product ${event.supplierProductId} in restaurant ${event.restaurantId}`);
        await this.createUnmappedProductAlert(event);
        return;
      }
    }

    // Get or create default location
    const location = await this.getOrCreateDefaultLocation(event.restaurantId);

    // Convert UOM if needed
    const qtyBase = await this.convertToBaseUOM(event.qty, event.uom, restaurantItemId);

    // Calculate expiry date if not provided
    const expiryDate = event.expiry ? new Date(event.expiry) : await this.calculateExpiryDate(restaurantItemId);

    // Create movement
    await this.movementsService.receiveStock({
      itemId: restaurantItemId,
      locationId: location.id,
      qty: qtyBase,
      uom: 'each', // Assuming base UOM is 'each'
      unitCost: 0, // Will be updated from order line
      refType: 'ORDER',
      refId: event.orderId,
      causedBy: 'SYSTEM',
      reason: `Auto-receipt from order ${event.orderId} (${eventType})`,
      metadata: {
        orderLineId: event.orderLineId,
        supplierId: event.supplierId,
        supplierProductId: event.supplierProductId,
        eventType,
        idempotencyKey: event.idempotencyKey,
      },
      idempotencyKey: event.idempotencyKey,
      expiryDate: expiryDate?.toISOString(),
      lotCode: event.lotCode,
    });

    this.logger.log(`Successfully processed ${eventType} event for order ${event.orderId}`);
  }

  private async createInTransitEntry(event: OrderLineDispatchedEvent | OrderLineDeliveredEvent) {
    // Create a virtual InTransit location entry
    const inTransitLocation = await this.getOrCreateInTransitLocation(event.restaurantId);
    
    // Resolve restaurantItemId
    let restaurantItemId = event.restaurantItemId;
    if (!restaurantItemId) {
      restaurantItemId = await this.resolveRestaurantItemId(
        event.restaurantId,
        event.supplierProductId
      );
      
      if (!restaurantItemId) {
        this.logger.warn(`No mapping found for supplier product ${event.supplierProductId} in restaurant ${event.restaurantId}`);
        await this.createUnmappedProductAlert(event);
        return;
      }
    }

    // Convert UOM
    const qtyBase = await this.convertToBaseUOM(event.qty, event.uom, restaurantItemId);

    // Create InTransit movement
    await this.movementsService.receiveStock({
      itemId: restaurantItemId,
      locationId: inTransitLocation.id,
      qty: qtyBase,
      uom: 'each',
      unitCost: 0,
      refType: 'ORDER',
      refId: event.orderId,
      causedBy: 'SYSTEM',
      reason: `InTransit from order ${event.orderId} (DISPATCHED)`,
      metadata: {
        orderLineId: event.orderLineId,
        supplierId: event.supplierId,
        supplierProductId: event.supplierProductId,
        eventType: 'DISPATCHED',
        idempotencyKey: event.idempotencyKey,
        inTransit: true,
      },
      idempotencyKey: event.idempotencyKey,
    });

    this.logger.log(`Created InTransit entry for order ${event.orderId}`);
  }

  private async moveFromInTransitToAvailable(event: OrderLineDeliveredEvent) {
    // Find the InTransit entry
    const inTransitLocation = await this.getOrCreateInTransitLocation(event.restaurantId);
    
    // Resolve restaurantItemId
    let restaurantItemId = event.restaurantItemId;
    if (!restaurantItemId) {
      restaurantItemId = await this.resolveRestaurantItemId(
        event.restaurantId,
        event.supplierProductId
      );
      
      if (!restaurantItemId) {
        this.logger.warn(`No mapping found for supplier product ${event.supplierProductId} in restaurant ${event.restaurantId}`);
        return;
      }
    }

    // Get default location for final receipt
    const defaultLocation = await this.getOrCreateDefaultLocation(event.restaurantId);

    // Convert UOM
    const qtyBase = await this.convertToBaseUOM(event.qty, event.uom, restaurantItemId);

    // Calculate expiry date
    const expiryDate = event.expiry ? new Date(event.expiry) : await this.calculateExpiryDate(restaurantItemId);

    // Create transfer from InTransit to Available
    await this.movementsService.transferStock({
      itemId: restaurantItemId,
      fromLocationId: inTransitLocation.id,
      toLocationId: defaultLocation.id,
      qty: qtyBase,
      uom: 'each',
      causedBy: 'SYSTEM',
      reason: `Transfer from InTransit to Available (order ${event.orderId})`,
      metadata: {
        orderLineId: event.orderLineId,
        supplierId: event.supplierId,
        supplierProductId: event.supplierProductId,
        eventType: 'DELIVERED',
        idempotencyKey: event.idempotencyKey,
      },
      idempotencyKey: `${event.idempotencyKey}-delivered`,
    });

    this.logger.log(`Moved from InTransit to Available for order ${event.orderId}`);
  }

  private async resolveRestaurantItemId(restaurantId: string, supplierProductId: string): Promise<string | null> {
    // Try to find existing mapping
    const supplierLink = await this.prisma.supplierLink.findFirst({
      where: {
        supplierProductId,
        item: {
          restaurantId,
        },
      },
    });

    if (supplierLink) {
      return supplierLink.itemId;
    }

    // Try fuzzy matching by name (simplified)
    // In a real implementation, this would be more sophisticated
    return null;
  }

  private async getOrCreateDefaultLocation(restaurantId: string) {
    let location = await this.prisma.location.findFirst({
      where: { restaurantId, active: true },
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
    }

    return location;
  }

  private async getOrCreateInTransitLocation(restaurantId: string) {
    let location = await this.prisma.location.findFirst({
      where: { 
        restaurantId, 
        code: 'IN_TRANSIT',
        active: true 
      },
    });

    if (!location) {
      location = await this.prisma.location.create({
        data: {
          restaurantId,
          name: 'In Transit',
          code: 'IN_TRANSIT',
          active: true,
        },
      });
    }

    return location;
  }

  private async convertToBaseUOM(qty: number, uom: string, itemId: string): Promise<number> {
    // Simplified UOM conversion - in real implementation, use UOM conversion table
    // For now, assume all quantities are already in base UOM
    return qty;
  }

  private async calculateExpiryDate(itemId: string): Promise<Date | undefined> {
    // Get item storage type
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item) return undefined;

    // Get default expiry windows from organization settings
    const settings = await this.prisma.organizationSettings.findFirst();
    const defaultWindows = settings?.defaultExpiryWindows as any || { CHILL: 7, DRY: 30, FREEZE: 30 };
    
    const days = defaultWindows[item.storageType] || 30;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    
    return expiryDate;
  }

  private async createUnmappedProductAlert(event: OrderLineDispatchedEvent | OrderLineDeliveredEvent) {
    await this.prisma.alert.create({
      data: {
        restaurantId: event.restaurantId,
        alertType: 'UNMAPPED_PRODUCT',
        severity: 'WARNING',
        message: `Product ${event.supplierProductId} from supplier ${event.supplierId} needs to be mapped to an inventory item`,
        metadata: {
          orderId: event.orderId,
          orderLineId: event.orderLineId,
          supplierId: event.supplierId,
          supplierProductId: event.supplierProductId,
        },
      },
    });
  }

  private async recordFulfillmentEvent(
    event: OrderLineDispatchedEvent | OrderLineDeliveredEvent,
    eventType: 'DISPATCHED' | 'DELIVERED'
  ) {
    await this.prisma.fulfillmentEvent.create({
      data: {
        orderId: event.orderId,
        orderLineId: event.orderLineId,
        clientId: event.clientId,
        type: eventType,
        qtyBase: event.qty,
        uomBase: event.uom,
        expiryDate: event.expiry ? new Date(event.expiry) : undefined,
        lotCode: event.lotCode,
        idempotencyKey: event.idempotencyKey,
        payload: event as any,
      },
    });
  }
}
