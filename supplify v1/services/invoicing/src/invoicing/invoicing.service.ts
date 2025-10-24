import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from './pdf.service';

@Injectable()
export class InvoicingService {
  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
  ) {}

  async createInvoiceFromOrder(orderId: string, orderData: any) {
    const invoiceNumber = `INV-${Date.now()}`;
    
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId,
        restaurantId: orderData.restaurantId,
        supplierId: orderData.supplierId,
        status: 'DRAFT',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        subtotal: orderData.subtotal,
        taxAmount: orderData.taxAmount,
        discountAmount: orderData.discountAmount || 0,
        total: orderData.total,
        currency: orderData.currency || 'USD',
        items: {
          create: orderData.items.map((item: any) => ({
            productId: item.productId,
            sku: item.sku,
            description: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            taxRate: item.taxRate || 0,
            total: item.total,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return invoice;
  }

  async generatePDF(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    });

    if (!invoice) throw new Error('Invoice not found');

    const template = await this.prisma.invoiceTemplate.findFirst({
      where: { isDefault: true },
    });

    const pdfUrl = await this.pdfService.generateInvoicePDF(invoice, template);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl, status: 'SENT' },
    });

    return pdfUrl;
  }

  async recordPayment(invoiceId: string, paymentData: any) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (!invoice) throw new Error('Invoice not found');

    const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), Number(paymentData.amount));

    await this.prisma.invoicePayment.create({
      data: {
        invoiceId,
        amount: paymentData.amount,
        method: paymentData.method,
        reference: paymentData.reference,
        note: paymentData.note,
        recordedBy: paymentData.recordedBy,
      },
    });

    const status = totalPaid >= Number(invoice.total) ? 'PAID' : invoice.status;

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: totalPaid,
        paidAt: status === 'PAID' ? new Date() : invoice.paidAt,
        status,
      },
    });

    return { success: true, totalPaid };
  }

  async getInvoices(filters: any) {
    return this.prisma.invoice.findMany({
      where: {
        ...(filters.restaurantId && { restaurantId: filters.restaurantId }),
        ...(filters.supplierId && { supplierId: filters.supplierId }),
        ...(filters.status && { status: filters.status }),
      },
      include: {
        items: true,
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    });
  }

  async getInvoice(id: string) {
    return this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
      },
    });
  }
}

