import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, OrderEventType } from '@prisma/client';

export interface CreateOrderDto {
  restaurantId: string;
  supplierId: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];
  notes?: string;
  deliveryAddress?: string;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  payload?: any;
  etaAt?: string;
  cancelReason?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create a new order with all items
   */
  async createOrder(dto: CreateOrderDto) {
    this.logger.log(`Creating order for restaurant ${dto.restaurantId} from supplier ${dto.supplierId}`);

    // Calculate totals
    const subtotal = dto.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * 0.1; // 10% tax
    const total = subtotal + taxAmount;

    const order = await this.prisma.order.create({
      data: {
        restaurantId: dto.restaurantId,
        supplierId: dto.supplierId,
        status: OrderStatus.PENDING,
        total,
        subtotal,
        tax: taxAmount,
        taxAmount,
        deliveryFee: 0, // Default delivery fee
        currency: 'USD',
        notes: dto.notes,
        deliveryAddress: dto.deliveryAddress,
        items: {
          create: dto.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            qty: item.quantity,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.quantity * item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
        events: {
          create: {
            type: OrderEventType.PENDING,
            actorType: 'SYSTEM',
            payload: { items: dto.items },
          },
        },
      },
      include: {
        items: true,
        events: true,
      },
    });

    this.logger.log(`Order ${order.id} created successfully`);
    return order;
  }

  /**
   * Update order status with proper validation
   */
  async updateOrderStatus(orderId: string, dto: UpdateOrderStatusDto, actorId?: string, actorType: string = 'SYSTEM') {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Validate status transition
    this.validateStatusTransition(order.status, dto.status);

    // Prepare update data
    const updateData: any = {
      status: dto.status,
      events: {
        create: {
          type: dto.status,
          actorType,
          actorId,
          payload: dto.payload || {},
        },
      },
    };

    // Set timestamps based on status
    switch (dto.status) {
      case OrderStatus.PROCESSING:
        updateData.acknowledgedAt = new Date();
        break;
      case OrderStatus.DISPATCHED:
        updateData.dispatchedAt = new Date();
        if (dto.etaAt) {
          updateData.etaAt = new Date(dto.etaAt);
        }
        break;
      case OrderStatus.DELIVERED:
        updateData.deliveredAt = new Date();
        // Trigger invoice creation
        await this.createInvoiceForOrder(orderId, order.restaurantId, order.supplierId);
        break;
      case OrderStatus.CANCELLED:
        updateData.cancelledAt = new Date();
        updateData.cancelReason = dto.cancelReason;
        break;
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.log(`Order ${orderId} status updated to ${dto.status}`);
    return updatedOrder;
  }

  /**
   * Get orders with filtering
   */
  async getOrders(filters: {
    restaurantId?: string;
    supplierId?: string;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};
    
    if (filters.restaurantId) where.restaurantId = filters.restaurantId;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.status) where.status = filters.status;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          events: {
            orderBy: { createdAt: 'desc' },
            take: 5, // Last 5 events
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total };
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        events: {
          orderBy: { createdAt: 'desc' },
        },
        invoices: true,
      },
    });
  }

  /**
   * Get order statistics
   */
  async getOrderStats(restaurantId?: string, supplierId?: string) {
    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    if (supplierId) where.supplierId = supplierId;

    const [total, pending, processing, dispatched, delivered, cancelled] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.PENDING } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.PROCESSING } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.DISPATCHED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.DELIVERED } }),
      this.prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
    ]);

    const totalValue = await this.prisma.order.aggregate({
      where: { ...where, status: OrderStatus.DELIVERED },
      _sum: { total: true },
    });

    return {
      total,
      pending,
      processing,
      dispatched,
      delivered,
      cancelled,
      totalValue: totalValue._sum.total || 0,
    };
  }

  /**
   * Create invoice when order is delivered
   */
  private async createInvoiceForOrder(orderId: string, restaurantId: string, supplierId: string) {
    this.logger.log(`Creating invoice for delivered order ${orderId}`);

    // Check if invoice already exists
    const existingInvoice = await this.prisma.invoice.findFirst({
      where: { orderId },
    });

    if (existingInvoice) {
      this.logger.log(`Invoice already exists for order ${orderId}`);
      return existingInvoice;
    }

    // Get order details
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId,
        restaurantId,
        supplierId,
        status: 'SENT',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        discountAmount: order.discountAmount,
        total: order.total,
        currency: order.currency,
        notes: `Invoice for order ${orderId}`,
        items: {
          create: order.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            sku: `SKU-${item.productId}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxRate: 0.1,
            total: item.total,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    this.logger.log(`Invoice ${invoice.invoiceNumber} created for order ${orderId}`);
    return invoice;
  }

  /**
   * Generate unique invoice number
   */
  private async generateInvoiceNumber(): Promise<string> {
    const count = await this.prisma.invoice.count();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const number = String(count + 1).padStart(4, '0');
    
    return `INV-${year}${month}-${number}`;
  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(from: OrderStatus, to: OrderStatus) {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.PENDING]: [OrderStatus.PLACED, OrderStatus.PROCESSING, OrderStatus.CANCELLED],
      [OrderStatus.PLACED]: [OrderStatus.ACKNOWLEDGED, OrderStatus.CANCELLED],
      [OrderStatus.PROCESSING]: [OrderStatus.ACKNOWLEDGED, OrderStatus.PREPARING, OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
      [OrderStatus.ACKNOWLEDGED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
      [OrderStatus.PREPARING]: [OrderStatus.DISPATCHED, OrderStatus.CANCELLED],
      [OrderStatus.DISPATCHED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [], // Final state
      [OrderStatus.CANCELLED]: [], // Final state
      [OrderStatus.ETA_UPDATED]: [OrderStatus.DISPATCHED, OrderStatus.DELIVERED],
      [OrderStatus.NOTE_ADDED]: [OrderStatus.PENDING, OrderStatus.PLACED, OrderStatus.PROCESSING, OrderStatus.ACKNOWLEDGED, OrderStatus.PREPARING, OrderStatus.DISPATCHED],
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new Error(`Invalid status transition from ${from} to ${to}`);
    }
  }
}
