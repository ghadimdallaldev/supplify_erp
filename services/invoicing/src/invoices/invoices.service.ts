import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateInvoiceDto {
  orderId: string;
  restaurantId: string;
  supplierId: string;
  issueDate?: Date;
  dueDate?: Date;
  notes?: string;
}

export interface InvoiceItemDto {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  restaurantId: string;
  supplierId: string;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  notes?: string;
  pdfUrl?: string;
  paidAt?: Date;
  paidAmount?: number;
  paymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItem[];
  order?: {
    id: string;
    status: string;
    approvedAt?: Date;
    approvedBy?: string;
  };
}

export interface InvoiceItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  total: number;
}

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create invoice from order
   */
  async createFromOrder(dto: CreateInvoiceDto): Promise<Invoice> {
    // Get order details
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Calculate totals
    const subtotal = order.items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
    const taxAmount = subtotal * 0.1; // 10% tax
    const total = subtotal + taxAmount;

    // Create invoice
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: dto.orderId,
        restaurantId: dto.restaurantId,
        supplierId: dto.supplierId,
        status: 'DRAFT',
        issueDate: dto.issueDate || new Date(),
        dueDate: dto.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subtotal,
        taxAmount,
        discountAmount: 0,
        total,
        currency: 'USD',
        notes: dto.notes,
        items: {
          create: order.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            sku: `SKU-${item.productId}`,
            quantity: item.qty,
            unitPrice: item.unitPrice,
            taxRate: 0.1,
            total: item.qty * item.unitPrice,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return this.mapToInvoice(invoice, order);
  }

  /**
   * Get invoices for restaurant
   */
  async getRestaurantInvoices(restaurantId: string, filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ invoices: Invoice[]; total: number }> {
    const where: any = { restaurantId };
    
    if (filters?.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          items: true,
          order: {
            select: {
              id: true,
              status: true,
              acknowledgedAt: true,
              deliveredAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices: invoices.map(inv => this.mapToInvoice(inv, inv.order)),
      total,
    };
  }

  /**
   * Get invoices for supplier
   */
  async getSupplierInvoices(supplierId: string, filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ invoices: Invoice[]; total: number }> {
    const where: any = { supplierId };
    
    if (filters?.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          items: true,
          order: {
            select: {
              id: true,
              status: true,
              acknowledgedAt: true,
              deliveredAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      invoices: invoices.map(inv => this.mapToInvoice(inv, inv.order)),
      total,
    };
  }

  /**
   * Update invoice status
   */
  async updateStatus(invoiceId: string, status: string, additionalData?: any): Promise<Invoice> {
    const updateData: any = { status };
    
    if (status === 'PAID') {
      updateData.paidAt = new Date();
      updateData.paidAmount = additionalData?.amount;
      updateData.paymentMethod = additionalData?.method;
    }

    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: updateData,
      include: {
        items: true,
        order: {
          select: {
            id: true,
            status: true,
            acknowledgedAt: true,
            deliveredAt: true,
          },
        },
      },
    });

    return this.mapToInvoice(invoice, invoice.order);
  }

  /**
   * Generate PDF for invoice
   */
  async generatePDF(invoiceId: string): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        order: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // In a real implementation, this would generate an actual PDF
    // For now, we'll return a mock URL
    const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
    
    // Update invoice with PDF URL
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    });

    return pdfUrl;
  }

  /**
   * Get invoice statistics
   */
  async getInvoiceStats(restaurantId?: string, supplierId?: string) {
    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    if (supplierId) where.supplierId = supplierId;

    const [total, paid, pending, overdue] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.count({ where: { ...where, status: 'PAID' } }),
      this.prisma.invoice.count({ where: { ...where, status: 'SENT' } }),
      this.prisma.invoice.count({ where: { ...where, status: 'OVERDUE' } }),
    ]);

    const totalValue = await this.prisma.invoice.aggregate({
      where,
      _sum: { total: true },
    });

    return {
      total,
      paid,
      pending,
      overdue,
      totalValue: totalValue._sum.total || 0,
    };
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
   * Map database invoice to Invoice interface
   */
  private mapToInvoice(dbInvoice: any, order?: any): Invoice {
    return {
      id: dbInvoice.id,
      invoiceNumber: dbInvoice.invoiceNumber,
      orderId: dbInvoice.orderId,
      restaurantId: dbInvoice.restaurantId,
      supplierId: dbInvoice.supplierId,
      status: dbInvoice.status,
      issueDate: dbInvoice.issueDate,
      dueDate: dbInvoice.dueDate,
      subtotal: dbInvoice.subtotal,
      taxAmount: dbInvoice.taxAmount,
      discountAmount: dbInvoice.discountAmount,
      total: dbInvoice.total,
      currency: dbInvoice.currency,
      notes: dbInvoice.notes,
      pdfUrl: dbInvoice.pdfUrl,
      paidAt: dbInvoice.paidAt,
      paidAmount: dbInvoice.paidAmount,
      paymentMethod: dbInvoice.paymentMethod,
      createdAt: dbInvoice.createdAt,
      updatedAt: dbInvoice.updatedAt,
      items: dbInvoice.items || [],
      order: order ? {
        id: order.id,
        status: order.status,
        approvedAt: order.acknowledgedAt,
        approvedBy: order.acknowledgedAt ? 'SYSTEM' : undefined,
      } : undefined,
    };
  }
}
