import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('invoices')
@Controller('invoices')
@ApiBearerAuth()
export class InvoicesController {
  @Get()
  async getInvoices() {
    return { success: true, data: [] };
  }
}
