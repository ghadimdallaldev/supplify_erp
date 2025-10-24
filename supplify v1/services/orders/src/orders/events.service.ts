import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { createLogger } from '@supplify/utils';

const logger = createLogger('orders-events');

@Injectable()
export class EventsService {
  constructor(@Inject('EVENTS_SERVICE') private eventsClient: ClientProxy) {}

  async emitOrderCreated(order: { id: string; restaurantId: string; supplierId: string; total: number }) {
    try {
      this.eventsClient.emit('order.created', {
        orderId: order.id,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        total: order.total,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.created event for order: ${order.id}`);
    } catch (error) {
      logger.error(`Failed to emit order.created event: ${error}`);
    }
  }

  async emitOrderStatusChanged(order: { id: string; status: string; restaurantId: string; supplierId: string }) {
    try {
      this.eventsClient.emit('orders.status.changed', {
        orderId: order.id,
        from: 'PLACED', // This should be tracked properly
        to: order.status,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted orders.status.changed event for order: ${order.id}`);
    } catch (error) {
      logger.error(`Failed to emit orders.status.changed event: ${error}`);
    }
  }

  async emitOrderMessageCreated(message: { id: string; orderId: string; senderId: string; senderRole: string; body: string }) {
    try {
      this.eventsClient.emit('orders.message.created', {
        messageId: message.id,
        orderId: message.orderId,
        senderId: message.senderId,
        senderRole: message.senderRole,
        body: message.body,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted orders.message.created event for message: ${message.id}`);
    } catch (error) {
      logger.error(`Failed to emit orders.message.created event: ${error}`);
    }
  }

  async emitSlaBreach(orderId: string, restaurantId: string, supplierId: string) {
    try {
      this.eventsClient.emit('orders.ack.sla.breach', {
        orderId,
        restaurantId,
        supplierId,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted orders.ack.sla.breach event for order: ${orderId}`);
    } catch (error) {
      logger.error(`Failed to emit orders.ack.sla.breach event: ${error}`);
    }
  }

  async emitEtaUpdated(orderId: string, etaAt: string, restaurantId: string, supplierId: string) {
    try {
      this.eventsClient.emit('orders.eta.updated', {
        orderId,
        etaAt,
        restaurantId,
        supplierId,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted orders.eta.updated event for order: ${orderId}`);
    } catch (error) {
      logger.error(`Failed to emit orders.eta.updated event: ${error}`);
    }
  }

  async emitOrderLineDispatched(orderLine: {
    orderId: string;
    orderLineId: string;
    clientId: string;
    supplierId: string;
    restaurantId: string;
    supplierProductId: string;
    restaurantItemId?: string;
    qty: number;
    uom: string;
    expiry?: string;
    lotCode?: string;
    idempotencyKey: string;
  }) {
    try {
      this.eventsClient.emit('orders.line.dispatched', {
        idempotencyKey: orderLine.idempotencyKey,
        clientId: orderLine.clientId,
        orderId: orderLine.orderId,
        orderLineId: orderLine.orderLineId,
        supplierId: orderLine.supplierId,
        restaurantId: orderLine.restaurantId,
        supplierProductId: orderLine.supplierProductId,
        restaurantItemId: orderLine.restaurantItemId,
        qty: orderLine.qty,
        uom: orderLine.uom,
        expiry: orderLine.expiry,
        lotCode: orderLine.lotCode,
        ts: new Date().toISOString(),
      });
      logger.info(`Emitted orders.line.dispatched event for order: ${orderLine.orderId}, line: ${orderLine.orderLineId}`);
    } catch (error) {
      logger.error(`Failed to emit orders.line.dispatched event: ${error}`);
    }
  }

  async emitOrderLineDelivered(orderLine: {
    orderId: string;
    orderLineId: string;
    clientId: string;
    supplierId: string;
    restaurantId: string;
    supplierProductId: string;
    restaurantItemId?: string;
    qty: number;
    uom: string;
    expiry?: string;
    lotCode?: string;
    idempotencyKey: string;
  }) {
    try {
      this.eventsClient.emit('orders.line.delivered', {
        idempotencyKey: orderLine.idempotencyKey,
        clientId: orderLine.clientId,
        orderId: orderLine.orderId,
        orderLineId: orderLine.orderLineId,
        supplierId: orderLine.supplierId,
        restaurantId: orderLine.restaurantId,
        supplierProductId: orderLine.supplierProductId,
        restaurantItemId: orderLine.restaurantItemId,
        qty: orderLine.qty,
        uom: orderLine.uom,
        expiry: orderLine.expiry,
        lotCode: orderLine.lotCode,
        ts: new Date().toISOString(),
      });
      logger.info(`Emitted orders.line.delivered event for order: ${orderLine.orderId}, line: ${orderLine.orderLineId}`);
    } catch (error) {
      logger.error(`Failed to emit orders.line.delivered event: ${error}`);
    }
  }

  async emitOrderDelivered(data: {
    orderId: string;
    restaurantId: string;
    supplierId: string;
    total: number;
  }) {
    try {
      await this.eventBus.emit('order.delivered', {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        total: data.total,
      });
      logger.info(`Emitted order.delivered event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.delivered event: ${error}`);
    }
  }

  // New multi-tenant events
  async emitOrderPlaced(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
    total: number;
  }) {
    try {
      this.eventsClient.emit(`tenant.${data.clientId}.orders.placed`, {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        total: data.total,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.placed event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.placed event: ${error}`);
    }
  }

  async emitOrderAcknowledged(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
  }) {
    try {
      this.eventsClient.emit(`tenant.${data.clientId}.orders.acknowledged`, {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.acknowledged event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.acknowledged event: ${error}`);
    }
  }

  async emitOrderPreparing(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
    note?: string;
  }) {
    try {
      this.eventsClient.emit(`tenant.${data.clientId}.orders.preparing`, {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        note: data.note,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.preparing event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.preparing event: ${error}`);
    }
  }

  async emitOrderDispatched(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
    carrier?: string;
    driverName?: string;
    driverPhone?: string;
    etaAt?: string;
  }) {
    try {
      this.eventsClient.emit(`tenant.${data.clientId}.orders.dispatched`, {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        carrier: data.carrier,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        etaAt: data.etaAt,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.dispatched event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.dispatched event: ${error}`);
    }
  }

  async emitOrderCancelled(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
    reason: string;
  }) {
    try {
      this.eventsClient.emit(`tenant.${data.clientId}.orders.cancelled`, {
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        reason: data.reason,
        timestamp: new Date().toISOString(),
      });
      logger.info(`Emitted order.cancelled event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit order.cancelled event: ${error}`);
    }
  }

  // Enhanced order delivered event for inventory and loyalty integration
  async emitOrderDeliveredEnhanced(data: {
    clientId: string;
    orderId: string;
    restaurantId: string;
    supplierId: string;
    total: number;
    items: any[];
  }) {
    try {
      // Emit for inventory auto-receive
      for (const item of data.items) {
        this.eventsClient.emit(`tenant.${data.clientId}.inventory.receive`, {
          idempotencyKey: `${data.orderId}-${item.id}-${Date.now()}`,
          clientId: data.clientId,
          orderId: data.orderId,
          orderLineId: item.id,
          supplierId: data.supplierId,
          restaurantId: data.restaurantId,
          supplierProductId: item.supplierProductId,
          restaurantItemId: item.restaurantItemId,
          qty: item.qtyDeliveredBase,
          uom: item.uomBase,
          timestamp: new Date().toISOString(),
        });
      }

      // Emit for loyalty points earning
      this.eventsClient.emit(`tenant.${data.clientId}.loyalty.earn`, {
        clientId: data.clientId,
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        total: data.total,
        timestamp: new Date().toISOString(),
      });

      // Emit for invoice generation
      this.eventsClient.emit(`tenant.${data.clientId}.invoices.generate`, {
        clientId: data.clientId,
        orderId: data.orderId,
        restaurantId: data.restaurantId,
        supplierId: data.supplierId,
        total: data.total,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Emitted enhanced order.delivered event for order: ${data.orderId}`);
    } catch (error) {
      logger.error(`Failed to emit enhanced order.delivered event: ${error}`);
    }
  }
}

