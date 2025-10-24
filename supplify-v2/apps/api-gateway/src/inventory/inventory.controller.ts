import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('inventory')
@Controller('inventory')
@ApiBearerAuth()
export class InventoryController {
  @Get('summary')
  async getInventorySummary() {
    return { success: true, data: [] };
  }
}
