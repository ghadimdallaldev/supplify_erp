import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryDashboardController } from './inventory-dashboard.controller';
import { OrderInventoryService } from '../orders/order-inventory.service';

@Module({
  controllers: [InventoryController, InventoryDashboardController],
  providers: [InventoryService, OrderInventoryService],
  exports: [InventoryService, OrderInventoryService],
})
export class InventoryModule {}
