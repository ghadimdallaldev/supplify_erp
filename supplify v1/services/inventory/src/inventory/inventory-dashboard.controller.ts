import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { OrderInventoryService } from '../orders/order-inventory.service';

@Controller('inventory-dashboard')
export class InventoryDashboardController {
  constructor(private orderInventoryService: OrderInventoryService) {}

  @MessagePattern('inventory.summary')
  async getInventorySummary(@Payload() data: { restaurantId: string }) {
    return this.orderInventoryService.getInventorySummary(data.restaurantId);
  }

  @MessagePattern('inventory.activity')
  async getRecentInventoryActivity(@Payload() data: { restaurantId: string; hours?: number }) {
    return this.orderInventoryService.getRecentInventoryActivity(data.restaurantId, data.hours || 24);
  }
}
