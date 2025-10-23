import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotFoundError, BadRequestError, createLogger } from '@supplify/utils';
import type { OrderStatus } from '@supplify/config';
import { ORDER_STATUSES, SLA_CONFIG, ORDER_EVENT_TYPES, ACTOR_TYPES } from '@supplify/config';

import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { EventsService } from './events.service';
import { PlaceOrderDto, UpdateOrderStatusDto, SearchOrdersDto } from './dto';

const logger = createLogger('orders-service');

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private cartService: CartService,
    private eventsService: EventsService,
  ) {}

  async placeOrder(restaurantId: string, dto: PlaceOrderDto) {
    const cart = await this.cartService.getOrCreate(restaurantId);

    if (cart.items.length === 0) {
      throw new BadRequestError('Cart is empty');
    }

    // Group items by supplier
    const itemsBySupplier = new Map<string, typeof cart.items>();
    for (const item of cart.items) {
      if (!itemsBySupplier.has(item.supplierId)) {
        itemsBySupplier.set(item.supplierId, []);
      }
      itemsBySupplier.get(item.supplierId)!.push(item);
    }

    // Create one order per supplier
    const orders = [];
    for (const [supplierId, items] of itemsBySupplier) {
      const subtotal = items.reduce(
        (sum, item) => sum + Number(item.unitPrice) * item.qty,
        0,
      );
      const tax = subtotal * 0.05; // 5% tax
      const deliveryFee = 10.0;
      const total = subtotal + tax + deliveryFee;

      const order = await this.prisma.order.create({
        data: {
          restaurantId,
          supplierId,
          status: 'PLACED',
          ackBySlaAt: new Date(Date.now() + SLA_CONFIG.ACKNOWLEDGEMENT_TIMEOUT * 60 * 1000), // Set SLA deadline
          subtotal,
          tax,
          deliveryFee,
          total,
          deliveryAddress: dto.deliveryAddress,
          notes: dto.notes,
          items: {
            create: items.map((item) => ({
              productId: item.productId,
              productName: `Product ${item.productId}`, // Should fetch from catalog
              qty: item.qty,
              unitPrice: item.unitPrice,
              subtotal: Number(item.unitPrice) * item.qty,
              notes: item.notes,
            })),
          },
          events: {
            create: {
              actorType: 'SYSTEM',
              actorId: restaurantId,
              type: 'PLACED',
              payload: { 
                restaurantId, 
                supplierId, 
                totalItems: items.length,
                totalAmount: total 
              },
            },
          },
        },
        include: {
          items: true,
          events: true,
        },
      });

      orders.push(order);

      // Emit event
      await this.eventsService.emitOrderCreated({
        id: order.id,
        restaurantId: order.restaurantId,
        supplierId: order.supplierId,
        total: Number(order.total),
      });
      logger.info(`Order created: ${order.id}`);
    }

    // Clear cart
    await this.cartService.clear(restaurantId);

    return {
      success: true,
      orders,
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    return order;
  }

  async search(dto: SearchOrdersDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (dto.restaurantId) {
      where.restaurantId = dto.restaurantId;
    }

    if (dto.supplierId) {
      where.supplierId = dto.supplierId;
    }

    if (dto.status) {
      where.status = dto.status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          events: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      nodes: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, actorId?: string, actorType: string = 'SYSTEM') {
    const order = await this.findOne(id);

    // Validate status transition
    this.validateStatusTransition(order.status as OrderStatus, dto.status as OrderStatus);

    // Prepare update data based on status
    const updateData: any = {
      status: dto.status,
      events: {
        create: {
          actorType,
          actorId,
          type: dto.status,
          payload: dto.payload || {},
        },
      },
    };

    // Set timestamps based on status
    switch (dto.status) {
      case 'ACKNOWLEDGED':
        updateData.ackBySlaAt = null; // Clear SLA deadline
        break;
      case 'DISPATCHED':
        updateData.dispatchedAt = new Date();
        if (dto.etaAt) {
          updateData.etaAt = new Date(dto.etaAt);
        }
        break;
      case 'DELIVERED':
        updateData.deliveredAt = new Date();
        // Emit order line events for inventory sync
        await this.emitOrderLineEvents(id, 'DELIVERED', order.supplierId);
        
        // Trigger invoice creation when order is delivered
        try {
          await this.createInvoiceForDeliveredOrder(id, order.restaurantId, order.supplierId);
        } catch (error) {
          logger.error(`Failed to create invoice for order ${id}:`, error);
          // Don't fail the order status update if invoice creation fails
        }
        break;
      case 'CANCELLED':
        updateData.cancelReason = dto.cancelReason;
        break;
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Emit event
    await this.eventsService.emitOrderStatusChanged(updated);
    logger.info(`Order ${id} status changed to ${dto.status}`);

    return updated;
  }

  // Specific order action methods
  async supplierAcknowledge(orderId: string, supplierId: string, idempotencyKey: string) {
    // Check idempotency
    const existingEvent = await this.prisma.orderEvent.findFirst({
      where: { 
        orderId, 
        type: 'ACKNOWLEDGED',
        payload: { path: ['idempotencyKey'], equals: idempotencyKey }
      }
    });
    
    if (existingEvent) {
      return this.findOne(orderId);
    }

    return this.updateStatus(orderId, { 
      status: 'ACKNOWLEDGED',
      payload: { idempotencyKey, supplierId }
    }, supplierId, 'SUPPLIER');
  }

  async supplierSetPreparing(orderId: string, supplierId: string, note?: string, idempotencyKey?: string) {
    return this.updateStatus(orderId, { 
      status: 'PREPARING',
      notes: note,
      payload: { idempotencyKey, supplierId }
    }, supplierId, 'SUPPLIER');
  }

  async supplierDispatch(orderId: string, supplierId: string, carrier?: string, driverName?: string, driverPhone?: string, etaAt?: Date, idempotencyKey?: string) {
    const order = await this.updateStatus(orderId, { 
      status: 'DISPATCHED',
      etaAt: etaAt ? etaAt.toISOString() : undefined,
      payload: { 
        idempotencyKey, 
        supplierId, 
        carrier, 
        driverName, 
        driverPhone 
      }
    }, supplierId, 'SUPPLIER');

    // Emit order line events for inventory sync
    await this.emitOrderLineEvents(orderId, 'DISPATCHED', supplierId, idempotencyKey);

    return order;
  }

  async supplierMarkDelivered(orderId: string, supplierId: string, proofUrl?: string, idempotencyKey?: string) {
    const order = await this.updateStatus(orderId, { 
      status: 'DELIVERED',
      payload: { 
        idempotencyKey, 
        supplierId, 
        proofUrl 
      }
    }, supplierId, 'SUPPLIER');

    // Emit order line events for inventory sync
    await this.emitOrderLineEvents(orderId, 'DELIVERED', supplierId, idempotencyKey);

    return order;
  }

  async restaurantConfirmDelivery(orderId: string, restaurantId: string, idempotencyKey?: string) {
    // This could trigger additional actions like invoice generation
    const order = await this.findOne(orderId);
    if (order.status !== 'DELIVERED') {
      throw new BadRequestError('Order must be delivered before confirmation');
    }
    
    // Add confirmation event
    await this.prisma.orderEvent.create({
      data: {
        orderId,
        actorType: 'RESTAURANT',
        actorId: restaurantId,
        type: 'NOTE_ADDED',
        payload: { 
          idempotencyKey, 
          restaurantId, 
          action: 'DELIVERY_CONFIRMED' 
        },
      },
    });

    return this.findOne(orderId);
  }

  async cancelOrder(orderId: string, reason: string, actorId: string, actorType: string, idempotencyKey?: string) {
    return this.updateStatus(orderId, { 
      status: 'CANCELLED',
      cancelReason: reason,
      payload: { 
        idempotencyKey, 
        actorId, 
        actorType, 
        reason 
      }
    }, actorId, actorType);
  }

  // Order messages
  async postOrderMessage(orderId: string, senderId: string, senderRole: string, body: string, attachments: string[] = []) {
    const message = await this.prisma.orderMessage.create({
      data: {
        orderId,
        senderId,
        senderRole,
        body,
        attachments,
      },
    });

    // Emit message event
    await this.eventsService.emitOrderMessageCreated(message);
    
    return message;
  }

  async getOrderMessages(orderId: string) {
    return this.prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // SLA monitoring
  async getOrdersWithBreachedSLA() {
    const now = new Date();
    return this.prisma.order.findMany({
      where: {
        status: 'PLACED',
        ackBySlaAt: {
          lt: now,
        },
      },
      include: {
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  // Helper method to emit order line events for inventory sync
  private async emitOrderLineEvents(orderId: string, eventType: 'DISPATCHED' | 'DELIVERED', supplierId: string, idempotencyKey?: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: { items: true },
      });

      if (!order) {
        logger.warn(`Order ${orderId} not found for event emission`);
        return;
      }

      const eventIdempotencyKey = idempotencyKey || `${orderId}-${eventType}-${Date.now()}`;

      for (const item of order.items) {
        const orderLineEvent = {
          orderId: order.id,
          orderLineId: item.id,
          clientId: order.restaurantId, // Using restaurantId as clientId for now
          supplierId: order.supplierId,
          restaurantId: order.restaurantId,
          supplierProductId: item.productId,
          restaurantItemId: undefined, // Will be resolved by inventory service
          qty: item.qty,
          uom: 'each', // Assuming base UOM
          expiry: undefined, // Could be added later
          lotCode: undefined, // Could be added later
          idempotencyKey: `${eventIdempotencyKey}-${item.id}`,
        };

        if (eventType === 'DISPATCHED') {
          await this.eventsService.emitOrderLineDispatched(orderLineEvent);
        } else if (eventType === 'DELIVERED') {
          await this.eventsService.emitOrderLineDelivered(orderLineEvent);
        }
      }
      logger.info(`Emitted ${eventType} events for order ${orderId} with ${order.items.length} lines`);
    } catch (error) {
      logger.error(`Failed to emit order line events for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Invoice creation for delivered orders
  private async createInvoiceForDeliveredOrder(orderId: string, restaurantId: string, supplierId: string) {
    logger.info(`Creating invoice for delivered order ${orderId}`);
    
    // This would typically call the invoicing service
    // For now, we'll just log the action
    try {
      // In a real implementation, this would:
      // 1. Call the invoicing service
      // 2. Create invoice record
      // 3. Send invoice to restaurant
      
      logger.info(`Invoice creation initiated for order ${orderId}`);
    } catch (error) {
      logger.error(`Failed to create invoice for order ${orderId}:`, error);
      throw error;
    }
  }

  private validateStatusTransition(from: OrderStatus, to: OrderStatus) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      PLACED: ['ACKNOWLEDGED', 'CANCELLED'],
      ACKNOWLEDGED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['DISPATCHED', 'CANCELLED'],
      DISPATCHED: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [], // Final state
      CANCELLED: [], // Final state
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new BadRequestError(
        `Invalid status transition from ${from} to ${to}`,
      );
    }
  }
}