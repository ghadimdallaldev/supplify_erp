import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { OrdersService } from './orders.service';
import { MultiTenantOrdersService } from './multi-tenant-orders.service';
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
  constructor(
    private ordersService: OrdersService,
    private multiTenantOrdersService: MultiTenantOrdersService,
  ) {}

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

  @MessagePattern('orders.dashboard.kpis')
  async handleDashboardKpis(@Payload() data: { restaurantId: string }) {
    return this.ordersService.getDashboardKpis(data.restaurantId);
  }

  @MessagePattern('orders.recent')
  async handleRecentOrders(@Payload() data: { restaurantId: string; limit?: number }) {
    return this.ordersService.getRecentOrders(data.restaurantId, data.limit);
  }

  @MessagePattern('orders.place')
  async handlePlaceOrder(@Payload() data: { restaurantId: string; deliveryAddress: string; notes?: string; clientId: string }) {
    return this.ordersService.placeOrder(data.restaurantId, {
      deliveryAddress: data.deliveryAddress,
      notes: data.notes,
    }, data.clientId);
  }

  // Multi-tenant endpoints
  @Post('multi-tenant/place')
  @ApiOperation({ summary: 'Place order with multi-tenant support' })
  async placeOrderMultiTenant(@Body() dto: PlaceOrderDto) {
    return this.multiTenantOrdersService.placeOrder(dto);
  }

  @Post('multi-tenant/:id/acknowledge')
  @ApiOperation({ summary: 'Supplier acknowledge order (multi-tenant)' })
  async supplierAcknowledgeMultiTenant(@Param('id') orderId: string, @Body() dto: SupplierAcknowledgeDto) {
    dto.orderId = orderId;
    return this.multiTenantOrdersService.supplierAcknowledge(dto);
  }

  @Post('multi-tenant/:id/preparing')
  @ApiOperation({ summary: 'Supplier set preparing (multi-tenant)' })
  async supplierSetPreparingMultiTenant(@Param('id') orderId: string, @Body() dto: SupplierSetPreparingDto) {
    dto.orderId = orderId;
    return this.multiTenantOrdersService.supplierSetPreparing(dto);
  }

  @Post('multi-tenant/:id/dispatch')
  @ApiOperation({ summary: 'Supplier dispatch order (multi-tenant)' })
  async supplierDispatchMultiTenant(@Param('id') orderId: string, @Body() dto: SupplierDispatchDto) {
    dto.orderId = orderId;
    return this.multiTenantOrdersService.supplierDispatch(dto);
  }

  @Post('multi-tenant/:id/delivered')
  @ApiOperation({ summary: 'Supplier mark delivered (multi-tenant)' })
  async supplierMarkDeliveredMultiTenant(@Param('id') orderId: string, @Body() dto: SupplierMarkDeliveredDto) {
    dto.orderId = orderId;
    return this.multiTenantOrdersService.supplierMarkDelivered(dto);
  }

  @Post('multi-tenant/:id/cancel')
  @ApiOperation({ summary: 'Cancel order (multi-tenant)' })
  async cancelOrderMultiTenant(@Param('id') orderId: string, @Body() dto: CancelOrderDto) {
    dto.orderId = orderId;
    return this.multiTenantOrdersService.cancelOrder(dto);
  }

  @Get('multi-tenant')
  @ApiOperation({ summary: 'Get orders (multi-tenant)' })
  async getOrdersMultiTenant(@Query('clientId') clientId: string, @Query() filter: any) {
    return this.multiTenantOrdersService.getOrders(clientId, filter);
  }

  @Get('multi-tenant/:id')
  @ApiOperation({ summary: 'Get order by ID (multi-tenant)' })
  async getOrderMultiTenant(@Param('id') orderId: string, @Query('clientId') clientId: string) {
    return this.multiTenantOrdersService.getOrder(clientId, orderId);
  }

  // Message patterns for multi-tenant operations
  @MessagePattern('orders.multi-tenant.place')
  async handlePlaceOrderMultiTenant(@Payload() data: PlaceOrderDto) {
    return this.multiTenantOrdersService.placeOrder(data);
  }

  @MessagePattern('orders.multi-tenant.acknowledge')
  async handleSupplierAcknowledgeMultiTenant(@Payload() data: SupplierAcknowledgeDto) {
    return this.multiTenantOrdersService.supplierAcknowledge(data);
  }

  @MessagePattern('orders.multi-tenant.preparing')
  async handleSupplierSetPreparingMultiTenant(@Payload() data: SupplierSetPreparingDto) {
    return this.multiTenantOrdersService.supplierSetPreparing(data);
  }

  @MessagePattern('orders.multi-tenant.dispatch')
  async handleSupplierDispatchMultiTenant(@Payload() data: SupplierDispatchDto) {
    return this.multiTenantOrdersService.supplierDispatch(data);
  }

  @MessagePattern('orders.multi-tenant.delivered')
  async handleSupplierMarkDeliveredMultiTenant(@Payload() data: SupplierMarkDeliveredDto) {
    return this.multiTenantOrdersService.supplierMarkDelivered(data);
  }

  @MessagePattern('orders.multi-tenant.cancel')
  async handleCancelOrderMultiTenant(@Payload() data: CancelOrderDto) {
    return this.multiTenantOrdersService.cancelOrder(data);
  }

  @MessagePattern('orders.multi-tenant.get')
  async handleGetOrdersMultiTenant(@Payload() data: { clientId: string; filter?: any }) {
    return this.multiTenantOrdersService.getOrders(data.clientId, data.filter);
  }

  @MessagePattern('orders.multi-tenant.get-by-id')
  async handleGetOrderMultiTenant(@Payload() data: { clientId: string; orderId: string }) {
    return this.multiTenantOrdersService.getOrder(data.clientId, data.orderId);
  }
}

