import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { OrdersService } from './orders.service';
import { PlaceOrderDto, UpdateOrderStatusDto, SearchOrdersDto } from './dto';
import { 
  SupplierAcknowledgeDto, 
  SupplierSetPreparingDto, 
  SupplierDispatchDto, 
  SupplierMarkDeliveredDto,
  RestaurantConfirmDeliveryDto,
  CancelOrderDto,
  PostOrderMessageDto
} from './dto/order-actions.dto';

@ApiTags('orders')
@Controller('orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @ApiOperation({ summary: 'Place order from cart' })
  async placeOrder(
    @Headers('x-restaurant-id') restaurantId: string,
    @Body() dto: PlaceOrderDto,
  ) {
    return this.ordersService.placeOrder(restaurantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Search orders' })
  async search(@Query() dto: SearchOrdersDto) {
    return this.ordersService.search(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto);
  }

  // Supplier-specific order actions
  @Post(':id/acknowledge')
  @ApiOperation({ summary: 'Supplier acknowledge order' })
  async supplierAcknowledge(
    @Param('id') id: string, 
    @Headers('x-supplier-id') supplierId: string,
    @Body() dto: SupplierAcknowledgeDto
  ) {
    return this.ordersService.supplierAcknowledge(id, supplierId, dto.idempotencyKey);
  }

  @Post(':id/preparing')
  @ApiOperation({ summary: 'Supplier set order as preparing' })
  async supplierSetPreparing(
    @Param('id') id: string, 
    @Headers('x-supplier-id') supplierId: string,
    @Body() dto: SupplierSetPreparingDto
  ) {
    return this.ordersService.supplierSetPreparing(id, supplierId, dto.note, dto.idempotencyKey);
  }

  @Post(':id/dispatch')
  @ApiOperation({ summary: 'Supplier dispatch order' })
  async supplierDispatch(
    @Param('id') id: string, 
    @Headers('x-supplier-id') supplierId: string,
    @Body() dto: SupplierDispatchDto
  ) {
    return this.ordersService.supplierDispatch(
      id, 
      supplierId, 
      dto.carrier, 
      dto.driverName, 
      dto.driverPhone, 
      dto.etaAt ? new Date(dto.etaAt) : undefined, 
      dto.idempotencyKey
    );
  }

  @Post(':id/delivered')
  @ApiOperation({ summary: 'Supplier mark order as delivered' })
  async supplierMarkDelivered(
    @Param('id') id: string, 
    @Headers('x-supplier-id') supplierId: string,
    @Body() dto: SupplierMarkDeliveredDto
  ) {
    return this.ordersService.supplierMarkDelivered(id, supplierId, dto.proofUrl, dto.idempotencyKey);
  }

  // Restaurant-specific order actions
  @Post(':id/confirm-delivery')
  @ApiOperation({ summary: 'Restaurant confirm delivery' })
  async restaurantConfirmDelivery(
    @Param('id') id: string, 
    @Headers('x-restaurant-id') restaurantId: string,
    @Body() dto: RestaurantConfirmDeliveryDto
  ) {
    return this.ordersService.restaurantConfirmDelivery(id, restaurantId, dto.idempotencyKey);
  }

  // General order actions
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order' })
  async cancelOrder(
    @Param('id') id: string, 
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') userRole: string,
    @Body() dto: CancelOrderDto
  ) {
    return this.ordersService.cancelOrder(id, dto.reason, userId, userRole, dto.idempotencyKey);
  }

  // Order messages
  @Post(':id/messages')
  @ApiOperation({ summary: 'Post order message' })
  async postOrderMessage(
    @Param('id') id: string, 
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') userRole: string,
    @Body() dto: PostOrderMessageDto
  ) {
    return this.ordersService.postOrderMessage(id, userId, userRole, dto.body, dto.attachments);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get order messages' })
  async getOrderMessages(@Param('id') id: string) {
    return this.ordersService.getOrderMessages(id);
  }

  // SLA monitoring
  @Get('sla/breached')
  @ApiOperation({ summary: 'Get orders with breached SLA' })
  async getOrdersWithBreachedSLA() {
    return this.ordersService.getOrdersWithBreachedSLA();
  }

  // RabbitMQ patterns
  @MessagePattern('orders.order.find')
  async handleFindOrder(@Payload() data: { id: string }) {
    return this.ordersService.findOne(data.id);
  }

  @MessagePattern('orders.search')
  async handleSearchOrders(@Payload() data: SearchOrdersDto) {
    return this.ordersService.search(data);
  }
}

