import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { PlaceOrderDto, SupplierAcknowledgeDto, SupplierSetPreparingDto, SupplierDispatchDto, SupplierMarkDeliveredDto, CancelOrderDto } from './dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class MultiTenantOrdersService {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
  ) {}

  // State machine transitions
  private readonly VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    PENDING: [OrderStatus.PLACED, OrderStatus.CANCELLED],
    PLACED: [OrderStatus.ACKNOWLEDGED, OrderStatus.CANCELLED],
    ACKNOWLEDGED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    PREPARING: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
    DISPATCHED: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    DELIVERED: [],
    CANCELLED: [],
    PROCESSING: [OrderStatus.ACKNOWLEDGED, OrderStatus.CANCELLED],
    ETA_UPDATED: [],
    NOTE_ADDED: [],
  };

  private readonly SLA_CONFIG = {
    ACKNOWLEDGEMENT_TIMEOUT: 30, // 30 minutes
  };

  /**
   * Place order from cart items - splits into multiple orders per supplier
   */
  async placeOrder(dto: PlaceOrderDto) {
    const { clientId, restaurantId, input } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, input.idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    // Validate cart items
    if (!input.items || input.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Group items by supplier
    const itemsBySupplier = this.groupItemsBySupplier(input.items);

    // Create one order per supplier
    const orders = [];
    const idempotencyData = {
      orders: [],
      totalOrders: 0,
      totalAmount: 0,
    };

    for (const [supplierId, items] of itemsBySupplier) {
      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.unitPrice * item.qtyOrderedBase), 0);
      
      // Apply loyalty discounts
      const loyaltyRedemption = input.loyaltyRedemptions?.find(r => r.supplierId === supplierId);
      const discount = loyaltyRedemption ? loyaltyRedemption.points * 0.01 : 0; // 1 point = $0.01
      
      const tax = (subtotal - discount) * 0.05; // 5% tax
      const shipping = 10.0; // Fixed shipping
      const totalNet = subtotal - discount + tax + shipping;

      // Create order with transaction
      const order = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            clientId,
            restaurantId,
            supplierId,
            status: OrderStatus.PLACED,
            ackBySlaAt: new Date(Date.now() + this.SLA_CONFIG.ACKNOWLEDGEMENT_TIMEOUT * 60 * 1000),
            subtotal,
            discount,
            tax,
            shipping,
            totalNet,
            currency: 'USD',
            deliveryAddress: input.deliveryAddress,
            notes: input.notes,
            placedAt: new Date(),
          },
          include: {
            items: true,
            events: true,
          },
        });

        // Create order items
        await tx.orderItem.createMany({
          data: items.map(item => ({
            clientId,
            orderId: order.id,
            supplierProductId: item.supplierProductId,
            restaurantItemId: item.restaurantItemId,
            qtyOrderedBase: item.qtyOrderedBase,
            qtyDeliveredBase: 0,
            uomBase: item.uomBase,
            unitPrice: item.unitPrice,
            lineTotal: item.unitPrice * item.qtyOrderedBase,
            meta: item.notes ? { notes: item.notes } : null,
          })),
        });

        // Create order event
        await tx.orderEvent.create({
          data: {
            clientId,
            orderId: order.id,
            type: 'PLACED',
            payload: {
              restaurantId,
              supplierId,
              totalItems: items.length,
              totalAmount: totalNet,
              loyaltyDiscount: discount,
            },
          },
        });

        return order;
      });

      orders.push(order);
      idempotencyData.orders.push(order.id);
      idempotencyData.totalAmount += totalNet;
    }

    idempotencyData.totalOrders = orders.length;

    // Store idempotency key
    await this.storeIdempotency(clientId, input.idempotencyKey, 'order', orders[0]?.id, idempotencyData);

    // Emit events
    for (const order of orders) {
      await this.eventsService.emitOrderPlaced({
        clientId,
        orderId: order.id,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        total: order.totalNet,
      });
    }

    return {
      success: true,
      orders: orders.map(o => ({ id: o.id, supplierId: o.supplierId, total: o.totalNet })),
      totalOrders: orders.length,
      totalAmount: idempotencyData.totalAmount,
    };
  }

  /**
   * Supplier acknowledge order
   */
  async supplierAcknowledge(dto: SupplierAcknowledgeDto) {
    const { clientId, orderId, idempotencyKey } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    // Get order with transaction lock
    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, clientId },
        include: { items: true, events: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      // Validate state transition
      if (!this.isValidTransition(order.status, OrderStatus.ACKNOWLEDGED)) {
        throw new BadRequestException(`Invalid transition from ${order.status} to ACKNOWLEDGED`);
      }

      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.ACKNOWLEDGED,
          updatedAt: new Date(),
        },
      });

      // Create order event
      await tx.orderEvent.create({
        data: {
          clientId,
          orderId: order.id,
          type: 'ACKNOWLEDGED',
          payload: {
            acknowledgedAt: new Date().toISOString(),
            slaMet: order.ackBySlaAt ? new Date() <= order.ackBySlaAt : true,
          },
        },
      });

      return updatedOrder;
    });

    // Store idempotency key
    await this.storeIdempotency(clientId, idempotencyKey, 'order_event', order.id, order);

    // Emit event
    await this.eventsService.emitOrderAcknowledged({
      clientId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
    });

    return order;
  }

  /**
   * Supplier set preparing
   */
  async supplierSetPreparing(dto: SupplierSetPreparingDto) {
    const { clientId, orderId, note, idempotencyKey } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, clientId },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!this.isValidTransition(order.status, OrderStatus.PREPARING)) {
        throw new BadRequestException(`Invalid transition from ${order.status} to PREPARING`);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.PREPARING,
          updatedAt: new Date(),
        },
      });

      await tx.orderEvent.create({
        data: {
          clientId,
          orderId: order.id,
          type: 'PREPARING',
          payload: {
            note,
            preparedAt: new Date().toISOString(),
          },
        },
      });

      return updatedOrder;
    });

    await this.storeIdempotency(clientId, idempotencyKey, 'order_event', order.id, order);

    await this.eventsService.emitOrderPreparing({
      clientId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
      note,
    });

    return order;
  }

  /**
   * Supplier dispatch order
   */
  async supplierDispatch(dto: SupplierDispatchDto) {
    const { clientId, orderId, carrier, driverName, driverPhone, etaAt, idempotencyKey } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, clientId },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!this.isValidTransition(order.status, OrderStatus.DISPATCHED)) {
        throw new BadRequestException(`Invalid transition from ${order.status} to DISPATCHED`);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DISPATCHED,
          dispatchedAt: new Date(),
          etaAt: etaAt ? new Date(etaAt) : null,
          meta: {
            carrier,
            driverName,
            driverPhone,
            dispatchedAt: new Date().toISOString(),
          },
        },
      });

      await tx.orderEvent.create({
        data: {
          clientId,
          orderId: order.id,
          type: 'DISPATCHED',
          payload: {
            carrier,
            driverName,
            driverPhone,
            etaAt,
            dispatchedAt: new Date().toISOString(),
          },
        },
      });

      return updatedOrder;
    });

    await this.storeIdempotency(clientId, idempotencyKey, 'order_event', order.id, order);

    await this.eventsService.emitOrderDispatched({
      clientId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
      carrier,
      driverName,
      driverPhone,
      etaAt,
    });

    return order;
  }

  /**
   * Supplier mark delivered
   */
  async supplierMarkDelivered(dto: SupplierMarkDeliveredDto) {
    const { clientId, orderId, proofUrl, idempotencyKey } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, clientId },
        include: { items: true },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!this.isValidTransition(order.status, OrderStatus.DELIVERED)) {
        throw new BadRequestException(`Invalid transition from ${order.status} to DELIVERED`);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date(),
          meta: {
            ...order.meta,
            proofUrl,
            deliveredAt: new Date().toISOString(),
          },
        },
      });

      // Update delivered quantities
      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: {
          qtyDeliveredBase: { increment: 1 }, // This should be calculated properly based on actual delivery
        },
      });

      await tx.orderEvent.create({
        data: {
          clientId,
          orderId: order.id,
          type: 'DELIVERED',
          payload: {
            proofUrl,
            deliveredAt: new Date().toISOString(),
          },
        },
      });

      return updatedOrder;
    });

    await this.storeIdempotency(clientId, idempotencyKey, 'order_event', order.id, order);

    // Emit events for inventory and loyalty
    await this.eventsService.emitOrderDelivered({
      clientId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
      total: order.totalNet,
      items: order.items,
    });

    return order;
  }

  /**
   * Cancel order
   */
  async cancelOrder(dto: CancelOrderDto) {
    const { clientId, orderId, reason, idempotencyKey } = dto;

    // Check idempotency
    const existingIdempotency = await this.checkIdempotency(clientId, idempotencyKey);
    if (existingIdempotency) {
      return existingIdempotency.payload;
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, clientId },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (!this.isValidTransition(order.status, OrderStatus.CANCELLED)) {
        throw new BadRequestException(`Invalid transition from ${order.status} to CANCELLED`);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelReason: reason,
          updatedAt: new Date(),
        },
      });

      await tx.orderEvent.create({
        data: {
          clientId,
          orderId: order.id,
          type: 'CANCELLED',
          payload: {
            reason,
            cancelledAt: new Date().toISOString(),
          },
        },
      });

      return updatedOrder;
    });

    await this.storeIdempotency(clientId, idempotencyKey, 'order_event', order.id, order);

    await this.eventsService.emitOrderCancelled({
      clientId,
      orderId: order.id,
      restaurantId: order.restaurantId,
      supplierId: order.supplierId,
      reason,
    });

    return order;
  }

  /**
   * Get orders for client
   */
  async getOrders(clientId: string, filter: any = {}) {
    const where = {
      clientId,
      ...filter,
    };

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  }

  /**
   * Get order by ID
   */
  async getOrder(clientId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  // Helper methods

  private groupItemsBySupplier(items: any[]) {
    const itemsBySupplier = new Map<string, any[]>();
    
    for (const item of items) {
      const supplierId = item.supplierId || 'default-supplier';
      if (!itemsBySupplier.has(supplierId)) {
        itemsBySupplier.set(supplierId, []);
      }
      itemsBySupplier.get(supplierId)!.push(item);
    }

    return itemsBySupplier;
  }

  private isValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): boolean {
    return this.VALID_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
  }

  private async checkIdempotency(clientId: string, key: string) {
    const idempotency = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });

    if (idempotency && idempotency.clientId === clientId && idempotency.expiresAt > new Date()) {
      return idempotency;
    }

    return null;
  }

  private async storeIdempotency(clientId: string, key: string, resourceType: string, resourceId: string, payload: any) {
    await this.prisma.idempotencyKey.create({
      data: {
        clientId,
        key,
        resourceType,
        resourceId,
        payload,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });
  }
}
