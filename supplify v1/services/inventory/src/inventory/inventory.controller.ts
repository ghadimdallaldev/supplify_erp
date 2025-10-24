import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { InventoryService, ProcessOrderDeliveryRequest } from './inventory.service';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post('process-order-delivery')
  @ApiOperation({ summary: 'Process order delivery and update inventory' })
  async processOrderDelivery(@Body() request: ProcessOrderDeliveryRequest) {
    return this.inventoryService.processOrderDelivery(request);
  }

  @Get('summary/:restaurantId')
  @ApiOperation({ summary: 'Get inventory summary for restaurant' })
  async getInventorySummary(@Param('restaurantId') restaurantId: string) {
    return this.inventoryService.getInventorySummary(restaurantId);
  }

  @Get('activity/:restaurantId')
  @ApiOperation({ summary: 'Get recent inventory activity' })
  async getRecentActivity(
    @Param('restaurantId') restaurantId: string,
    @Query('limit') limit?: number,
  ) {
    return this.inventoryService.getRecentActivity(restaurantId, limit ? parseInt(limit.toString()) : 10);
  }

  @Post('adjustment')
  @ApiOperation({ summary: 'Create manual inventory adjustment' })
  async createAdjustment(@Body() body: {
    itemId: string;
    locationId: string;
    restaurantId: string;
    adjustment: number;
    reason: string;
    userId: string;
  }) {
    return this.inventoryService.createAdjustment(
      body.itemId,
      body.locationId,
      body.restaurantId,
      body.adjustment,
      body.reason,
      body.userId,
    );
  }

  // RabbitMQ patterns
  @MessagePattern('inventory.process-order-delivery')
  async handleProcessOrderDelivery(@Payload() data: ProcessOrderDeliveryRequest) {
    return this.inventoryService.processOrderDelivery(data);
  }

  @MessagePattern('inventory.get-summary')
  async handleGetInventorySummary(@Payload() data: { restaurantId: string }) {
    return this.inventoryService.getInventorySummary(data.restaurantId);
  }

  @MessagePattern('inventory.get-activity')
  async handleGetRecentActivity(@Payload() data: { restaurantId: string; limit?: number }) {
    return this.inventoryService.getRecentActivity(data.restaurantId, data.limit || 10);
  }
}
