import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { ClientId, CurrentUser, AuthContext } from '../auth/auth.decorator';
import { CreateInvoiceInput } from './dto/create-invoice.input';
import { PlaceOrderInput } from './dto/place-order.input';
import { OrderFilter, PageInput } from './dto/order-filter.input';

@Resolver()
@UseGuards(AuthGuard)
export class DashboardResolver {
  constructor(
    @Inject('ORDERS_SERVICE') private ordersClient: ClientProxy,
    @Inject('INVENTORY_SERVICE') private inventoryClient: ClientProxy,
    @Inject('LOYALTY_SERVICE') private loyaltyClient: ClientProxy,
    @Inject('SUPPLIERS_SERVICE') private suppliersClient: ClientProxy,
    @Inject('INVOICING_SERVICE') private invoicingClient: ClientProxy,
    @Inject('FLAGS_SERVICE') private flagsClient: ClientProxy,
  ) {}

  @Query(() => String)
  @UseGuards(AuthGuard)
  async restaurantDashboardKpis(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      const result = await firstValueFrom(
        this.ordersClient.send('orders.dashboard.kpis', { restaurantId, clientId }),
      );
      return JSON.stringify(result);
    } catch (error) {
      // Return mock data if service is not available
      return JSON.stringify({
        activeOrders: 5,
        monthlySpend: 1250.50,
        lowStockCount: 3,
        loyaltyPoints: 450
      });
    }
  }

  @Query(() => String)
  @UseGuards(AuthGuard)
  async recentOrders(@Args('limit', { nullable: true }) limit: number = 10, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      console.log('Dashboard resolver: Fetching recent orders for', { restaurantId, clientId, limit });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.recent', { restaurantId, clientId, limit }),
      );
      console.log('Dashboard resolver: Recent orders result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.log('Orders service not available, returning mock data');
      return JSON.stringify([
        {
          id: 'order-1',
          supplierName: 'Fresh Foods Co',
          total: 125.50,
          status: 'DELIVERED',
          createdAt: new Date().toISOString()
        },
        {
          id: 'order-2', 
          supplierName: 'Quality Meats',
          total: 89.75,
          status: 'IN_TRANSIT',
          createdAt: new Date(Date.now() - 86400000).toISOString()
        }
      ]);
    }
  }

  @Query(() => String)
  @UseGuards(AuthGuard)
  async orders(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      console.log('Dashboard resolver: Fetching all orders for', { restaurantId, clientId });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.search', { restaurantId, clientId }),
      );
      console.log('Dashboard resolver: All orders result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.log('Orders service not available, returning mock data');
      return JSON.stringify({ 
        nodes: [
          {
            id: 'order-1',
            clientId: 'mock-client-id',
            restaurantId: 'golden-fork',
            supplierId: 'supplier-1',
            status: 'DELIVERED',
            subtotal: 125.50,
            discount: 0,
            tax: 12.55,
            shipping: 5.00,
            totalNet: 143.05,
            currency: 'USD',
            deliveryAddress: '123 Main St, City, State',
            notes: 'Please ring doorbell',
            placedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [],
            events: []
          }
        ], 
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 } 
      });
    }
  }

  @Query(() => String)
  @UseGuards(AuthGuard)
  async inventorySummary(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      const result = await firstValueFrom(
        this.inventoryClient.send('inventory.summary', { restaurantId, clientId }),
      );
      return JSON.stringify(result);
    } catch (error) {
      console.log('Inventory service not available, returning mock data');
      return JSON.stringify({
        totalItems: 150,
        totalValue: 2500.75,
        lowStock: 8,
        outOfStock: 2
      });
    }
  }

  @Query(() => String)
  async recentInventoryActivity(@Args('hours', { nullable: true }) hours: number = 24, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      const result = await firstValueFrom(
        this.inventoryClient.send('inventory.activity', { restaurantId, hours }),
      );
      return JSON.stringify(result);
    } catch (error) {
      console.log('Inventory service not available, returning mock data');
      return JSON.stringify([
        {
          itemId: 'item-1',
          change: -5,
          reason: 'Order delivery',
          at: new Date().toISOString(),
          orderId: 'order-1'
        },
        {
          itemId: 'item-2',
          change: 10,
          reason: 'Stock replenishment',
          at: new Date(Date.now() - 3600000).toISOString(),
          orderId: null
        }
      ]);
    }
  }

  @Query(() => String)
  async myLoyaltyWallets(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      const result = await firstValueFrom(
        this.loyaltyClient.send('loyalty.wallets', { restaurantId }),
      );
      return JSON.stringify(result);
    } catch (error) {
      console.log('Loyalty service not available, returning mock data');
      return JSON.stringify([
        {
          supplierId: 'supplier-1',
          supplierName: 'Fresh Foods Co',
          points: 450,
          redeemRate: 0.01,
          earnRate: 0.02
        }
      ]);
    }
  }

  @Query(() => String)
  async loyaltyPrograms(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    try {
      const result = await firstValueFrom(
        this.loyaltyClient.send('loyalty.programs', {}),
      );
      return JSON.stringify(result);
    } catch (error) {
      console.log('Loyalty service not available, returning mock data');
      return JSON.stringify([
        {
          id: 'program-1',
          supplierId: 'supplier-1',
          name: 'Fresh Foods Loyalty',
          active: true,
          earnRate: 0.02,
          redeemRate: 0.01,
          minRedeem: 100
        }
      ]);
    }
  }

  @Query(() => String)
  async restaurantSuppliers(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const restaurantId = user.user.organizationId;
    try {
      const result = await firstValueFrom(
        this.suppliersClient.send('suppliers.restaurant', { restaurantId }),
      );
      return JSON.stringify(result);
    } catch (error) {
      console.log('Suppliers service not available, returning mock data');
      return JSON.stringify([
        {
          id: 'supplier-1',
          restaurantId: 'golden-fork',
          supplierId: 'supplier-1',
          supplierName: 'Fresh Foods Co',
          pinned: true,
          featured: false,
          createdAt: new Date().toISOString()
        },
        {
          id: 'supplier-2',
          restaurantId: 'golden-fork',
          supplierId: 'supplier-2',
          supplierName: 'Quality Meats',
          pinned: false,
          featured: true,
          createdAt: new Date().toISOString()
        }
      ]);
    }
  }

  @Mutation(() => Boolean)
  async redeemLoyaltyPoints(
    @Args('supplierId') supplierId: string,
    @Args('points') points: number,
    @Args('orderId') orderId: string,
    @ClientId() clientId: string,
    @CurrentUser() user: AuthContext,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = user.user.organizationId;
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.redeem', {
        restaurantId,
        supplierId,
        points,
        orderId,
      }),
    );
    return result.success;
  }

  @Mutation(() => String)
  async addSupplier(@Args('supplierId') supplierId: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = user.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.add', { restaurantId, supplierId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async pinSupplier(
    @Args('supplierId') supplierId: string,
    @Args('pinned') pinned: boolean,
    @ClientId() clientId: string,
    @CurrentUser() user: AuthContext,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = user.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.pin', { restaurantId, supplierId, pinned }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async featureSupplier(
    @Args('supplierId') supplierId: string,
    @Args('featured') featured: boolean,
    @ClientId() clientId: string,
    @CurrentUser() user: AuthContext,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = user.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.feature', { restaurantId, supplierId, featured }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async invoices(
    @Args('userId') userId: string,
    @Args('userRole') userRole: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    try {
      console.log('Dashboard resolver: Fetching invoices for', { userId, userRole, status });
      const result = await firstValueFrom(
        this.invoicingClient.send('invoices.find', { userId, userRole, status }),
      );
      console.log('Dashboard resolver: Invoice result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching invoices', error);
      throw error;
    }
  }

  @Query(() => String)
  async invoiceStats(
    @Args('userId') userId: string,
    @Args('userRole') userRole: string,
  ) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.stats', { userId, userRole }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async createInvoice(@Args('input') input: CreateInvoiceInput, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.create', input),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async updateInvoiceStatus(
    @Args('invoiceId') invoiceId: string,
    @Args('status') status: string,
    @Args('amount', { nullable: true }) amount?: number,
    @Args('method', { nullable: true }) method?: string,
  ) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.updateStatus', { invoiceId, status, amount, method }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async generateInvoicePDF(@Args('invoiceId') invoiceId: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.generatePDF', { invoiceId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async featureFlags(@ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    const result = await firstValueFrom(
      this.flagsClient.send('flags.get.all', {}),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async evaluateFeatureFlag(
    @Args('flagKey') flagKey: string,
    @Args('orgType', { nullable: true }) orgType?: string,
    @Args('orgId', { nullable: true }) orgId?: string,
    @Args('userId', { nullable: true }) userId?: string,
  ) {
    const result = await firstValueFrom(
      this.flagsClient.send('flags.evaluate', {
        flagKey,
        context: {
          env: 'dev', // TODO: Get from environment
          orgType,
          orgId,
          userId,
        },
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async placeOrder(@Args('input') input: PlaceOrderInput, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = user.user.organizationId;
    try {
      console.log('Dashboard resolver: Placing order for', { restaurantId, input });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.place', { restaurantId, ...input }),
      );
      console.log('Dashboard resolver: Order placed result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error placing order', error);
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Multi-tenant order queries
  @Query(() => String)
  async myOrders(@Args('filter', { nullable: true }) filter: OrderFilter, @Args('pagination', { nullable: true }) pagination: PageInput, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Fetching orders for', { clientId, filter, pagination });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.get', { clientId, filter }),
      );
      console.log('Dashboard resolver: Orders result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching orders', error);
      return JSON.stringify({ nodes: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }
  }

  @Query(() => String)
  async order(@Args('id') id: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Fetching order by ID', { clientId, orderId: id });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.get-by-id', { clientId, orderId: id }),
      );
      console.log('Dashboard resolver: Order result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching order', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Multi-tenant order mutations
  @Mutation(() => String)
  async placeOrderMultiTenant(@Args('input') input: PlaceOrderInput, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId and restaurantId from context/auth
    // Use the clientId from the decorator
    const restaurantId = user.user.organizationId;
    try {
      console.log('Dashboard resolver: Placing multi-tenant order', { clientId, restaurantId, input, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.place', { clientId, restaurantId, input, idempotencyKey }),
      );
      console.log('Dashboard resolver: Multi-tenant order placed result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error placing multi-tenant order', error);
      return JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  @Mutation(() => String)
  async supplierAcknowledge(@Args('orderId') orderId: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Supplier acknowledging order', { clientId, orderId, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.acknowledge', { clientId, orderId, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order acknowledged result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error acknowledging order', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  @Mutation(() => String)
  async supplierSetPreparing(@Args('orderId') orderId: string, @Args('note', { nullable: true }) note: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Supplier set preparing', { clientId, orderId, note, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.preparing', { clientId, orderId, note, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order set preparing result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error setting order preparing', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  @Mutation(() => String)
  async supplierDispatch(@Args('orderId') orderId: string, @Args('carrier', { nullable: true }) carrier: string, @Args('driverName', { nullable: true }) driverName: string, @Args('driverPhone', { nullable: true }) driverPhone: string, @Args('etaAt', { nullable: true }) etaAt: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Supplier dispatching order', { clientId, orderId, carrier, driverName, driverPhone, etaAt, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.dispatch', { clientId, orderId, carrier, driverName, driverPhone, etaAt, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order dispatched result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error dispatching order', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  @Mutation(() => String)
  async supplierMarkDelivered(@Args('orderId') orderId: string, @Args('proofUrl', { nullable: true }) proofUrl: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Supplier marking order delivered', { clientId, orderId, proofUrl, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.delivered', { clientId, orderId, proofUrl, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order delivered result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error marking order delivered', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  @Mutation(() => String)
  async cancelOrder(@Args('orderId') orderId: string, @Args('reason') reason: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() user: AuthContext) {
    // TODO: Get clientId from context/auth
    // Use the clientId from the decorator
    try {
      console.log('Dashboard resolver: Cancelling order', { clientId, orderId, reason, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.cancel', { clientId, orderId, reason, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order cancelled result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error cancelling order', error);
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }
}
