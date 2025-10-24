import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { InvoicesService, CreateInvoiceDto } from './invoices.service';

@ApiTags('invoices')
@Controller('invoices')
@ApiBearerAuth()
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  @Post()
  @ApiOperation({ summary: 'Create invoice from order' })
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createFromOrder(dto);
  }

  @Get('restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get invoices for restaurant' })
  async getRestaurantInvoices(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.invoicesService.getRestaurantInvoices(restaurantId, {
      status,
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
    });
  }

  @Get('supplier/:supplierId')
  @ApiOperation({ summary: 'Get invoices for supplier' })
  async getSupplierInvoices(
    @Param('supplierId') supplierId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.invoicesService.getSupplierInvoices(supplierId, {
      status,
      limit: limit ? parseInt(limit.toString()) : undefined,
      offset: offset ? parseInt(offset.toString()) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get invoice by ID' })
  async getInvoice(@Param('id') id: string) {
    // This would need to be implemented in the service
    throw new Error('Not implemented');
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update invoice status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; amount?: number; method?: string },
  ) {
    return this.invoicesService.updateStatus(id, body.status, {
      amount: body.amount,
      method: body.method,
    });
  }

  @Post(':id/pdf')
  @ApiOperation({ summary: 'Generate PDF for invoice' })
  async generatePDF(@Param('id') id: string) {
    const pdfUrl = await this.invoicesService.generatePDF(id);
    return { pdfUrl };
  }

  @Get('stats/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get invoice statistics for restaurant' })
  async getRestaurantStats(@Param('restaurantId') restaurantId: string) {
    return this.invoicesService.getInvoiceStats(restaurantId);
  }

  @Get('stats/supplier/:supplierId')
  @ApiOperation({ summary: 'Get invoice statistics for supplier' })
  async getSupplierStats(@Param('supplierId') supplierId: string) {
    return this.invoicesService.getInvoiceStats(undefined, supplierId);
  }

  // RabbitMQ patterns
  @MessagePattern('invoices.create')
  async handleCreateInvoice(@Payload() data: CreateInvoiceDto) {
    return this.invoicesService.createFromOrder(data);
  }

  @MessagePattern('invoices.restaurant.find')
  async handleGetRestaurantInvoices(@Payload() data: { restaurantId: string; filters?: any }) {
    return this.invoicesService.getRestaurantInvoices(data.restaurantId, data.filters);
  }

  @MessagePattern('invoices.supplier.find')
  async handleGetSupplierInvoices(@Payload() data: { supplierId: string; filters?: any }) {
    return this.invoicesService.getSupplierInvoices(data.supplierId, data.filters);
  }

  @MessagePattern('invoices.find')
  async handleGetInvoices(@Payload() data: { userId: string; userRole: string; status?: string }) {
    if (data.userRole === 'restaurant') {
      return this.invoicesService.getRestaurantInvoices(data.userId, { status: data.status });
    } else if (data.userRole === 'supplier') {
      return this.invoicesService.getSupplierInvoices(data.userId, { status: data.status });
    }
    throw new Error('Invalid user role');
  }

  @MessagePattern('invoices.stats')
  async handleGetInvoiceStats(@Payload() data: { userId: string; userRole: string }) {
    if (data.userRole === 'restaurant') {
      return this.invoicesService.getInvoiceStats(data.userId);
    } else if (data.userRole === 'supplier market') {
      return this.invoicesService.getInvoiceStats(undefined, data.userId);
    }
    throw new Error('Invalid user role');
  }

  @MessagePattern('invoices.update.status')
  async handleUpdateInvoiceStatus(@Payload() data: { invoiceId: string; status: string; amount?: number; method?: string }) {
    return this.invoicesService.updateStatus(data.invoiceId, data.status, {
      amount: data.amount,
      method: data.method,
    });
  }

  @MessagePattern('invoices.generate.pdf')
  async handleGeneratePDF(@Payload() data: { invoiceId: string }) {
    return this.invoicesService.generatePDF(data.invoiceId);
  }
}
