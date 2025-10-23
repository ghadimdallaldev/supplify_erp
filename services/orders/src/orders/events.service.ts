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
}

