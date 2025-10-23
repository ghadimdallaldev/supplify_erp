import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { InvoicingService } from './invoicing.service';

@Controller('invoices')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Get()
  async getInvoices(@Query() filters: any) {
    return this.invoicingService.getInvoices(filters);
  }

  @Get(':id')
  async getInvoice(@Param('id') id: string) {
    return this.invoicingService.getInvoice(id);
  }

  @Post(':id/generate-pdf')
  async generatePDF(@Param('id') id: string) {
    const url = await this.invoicingService.generatePDF(id);
    return { success: true, pdfUrl: url };
  }

  @Post(':id/payments')
  async recordPayment(@Param('id') id: string, @Body() paymentData: any) {
    return this.invoicingService.recordPayment(id, paymentData);
  }

  @MessagePattern('order.completed')
  async handleOrderCompleted(data: any) {
    const invoice = await this.invoicingService.createInvoiceFromOrder(data.orderId, data);
    await this.invoicingService.generatePDF(invoice.id);
    console.log(`✅ Invoice ${invoice.invoiceNumber} created for order ${data.orderId}`);
  }
}

