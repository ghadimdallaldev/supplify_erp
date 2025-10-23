import { Injectable, OnModuleInit } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';

export interface InventoryEvent {
  type: string;
  restaurantId: string;
  data: any;
  timestamp: Date;
}

/**
 * Events Service
 * Publishes inventory events to RabbitMQ
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private client: ClientProxy;

  onModuleInit() {
    const rmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
    
    this.client = ClientProxyFactory.create({
      transport: Transport.RMQ,
      options: {
        urls: [rmqUrl],
        queue: 'inventory_events',
        queueOptions: {
          durable: true,
        },
      },
    });
  }

  /**
   * Publish an inventory event
   */
  async publish(event: InventoryEvent) {
    try {
      await this.client.emit(event.type, event);
      console.log(`📨 Published event: ${event.type}`);
    } catch (error) {
      console.error(`Failed to publish event ${event.type}:`, error);
    }
  }

  // Specific event publishers

  async stockReceived(data: {
    restaurantId: string;
    itemId: string;
    locationId: string;
    qty: number;
    batchId: string;
    unitCost: number;
  }) {
    await this.publish({
      type: 'inventory.received',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async stockIssued(data: {
    restaurantId: string;
    itemId: string;
    locationId: string;
    qty: number;
    refType: string;
    refId?: string;
  }) {
    await this.publish({
      type: 'inventory.issued',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async stockTransferred(data: {
    restaurantId: string;
    itemId: string;
    fromLocationId: string;
    toLocationId: string;
    qty: number;
  }) {
    await this.publish({
      type: 'inventory.transferred',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async stockWasted(data: {
    restaurantId: string;
    itemId: string;
    locationId: string;
    qty: number;
    cost: number;
    reason: string;
  }) {
    await this.publish({
      type: 'inventory.wasted',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async stockAdjusted(data: {
    restaurantId: string;
    itemId: string;
    locationId: string;
    adjustment: number;
    reason: string;
  }) {
    await this.publish({
      type: 'inventory.adjusted',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async lowStock(data: {
    restaurantId: string;
    itemId: string;
    itemName: string;
    locationId: string;
    locationName: string;
    qtyAvailable: number;
    reorderPoint: number;
  }) {
    await this.publish({
      type: 'inventory.lowstock',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async nearExpiry(data: {
    restaurantId: string;
    itemId: string;
    itemName: string;
    batchId: string;
    locationId: string;
    expiryDate: Date;
    qty: number;
    daysUntilExpiry: number;
  }) {
    await this.publish({
      type: 'inventory.nearexpiry',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async countStarted(data: {
    restaurantId: string;
    countId: string;
    locationId: string;
    countType: string;
  }) {
    await this.publish({
      type: 'inventory.count.started',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async countFinalized(data: {
    restaurantId: string;
    countId: string;
    locationId: string;
    totalVarianceCost: number;
    accuracyPct: number;
  }) {
    await this.publish({
      type: 'inventory.count.finalized',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }

  async replenishmentCreated(data: {
    restaurantId: string;
    locationId: string;
    itemsBelowPar: number;
  }) {
    await this.publish({
      type: 'inventory.replenishment.created',
      restaurantId: data.restaurantId,
      data,
      timestamp: new Date(),
    });
  }
}

