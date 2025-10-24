import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  @Get()
  async getOrders() {
    return { success: true, data: [] };
  }
}
