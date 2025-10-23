import { Resolver, Query, Args, Mutation, UseGuards } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { ClientId, CurrentUser, AuthContext } from '../auth/auth.decorator';

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
  async restaurantDashboardKpis(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.ordersClient.send('orders.dashboard.kpis', { restaurantId, clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async recentOrders(@Args('limit', { nullable: true }) limit: number = 10, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    try {
      console.log('Dashboard resolver: Fetching recent orders for', { restaurantId, clientId, limit });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.recent', { restaurantId, clientId, limit }),
      );
      console.log('Dashboard resolver: Recent orders result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching recent orders', error);
      // Return empty array as fallback
      return JSON.stringify([]);
    }
  }

  @Query(() => String)
  async orders(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    try {
      console.log('Dashboard resolver: Fetching all orders for', { restaurantId, clientId });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.search', { restaurantId, clientId }),
      );
      console.log('Dashboard resolver: All orders result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching orders', error);
      // Return empty array as fallback
      return JSON.stringify({ nodes: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
    }
  }

  @Query(() => String)
  async inventorySummary(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.inventoryClient.send('inventory.summary', { restaurantId, clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async recentInventoryActivity(@Args('hours', { nullable: true }) hours: number = 24, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.inventoryClient.send('inventory.activity', { restaurantId, clientId, hours }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async myLoyaltyWallets(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.wallets', { restaurantId, clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async loyaltyPrograms(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.programs', { clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async restaurantSuppliers(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.restaurant', { restaurantId, clientId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => Boolean)
  async redeemLoyaltyPoints(
    @Args('supplierId') supplierId: string,
    @Args('points') points: number,
    @Args('orderId') orderId: string,
    @ClientId() clientId: string,
    @CurrentUser() authContext: AuthContext,
  ) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.redeem', {
        restaurantId,
        clientId,
        supplierId,
        points,
        orderId,
      }),
    );
    return result;
  }

  @Mutation(() => String)
  async addSupplier(@Args('supplierId') supplierId: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.add', { restaurantId, clientId, supplierId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async pinSupplier(@Args('supplierId') supplierId: string, @Args('pinned') pinned: boolean, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.pin', { restaurantId, clientId, supplierId, pinned }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async featureSupplier(@Args('supplierId') supplierId: string, @Args('featured') featured: boolean, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.feature', { restaurantId, clientId, supplierId, featured }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async invoices(
    @Args('userId') userId: string,
    @Args('userRole') userRole: string,
    @Args('status', { nullable: true }) status: string,
    @ClientId() clientId: string,
    @CurrentUser() authContext: AuthContext,
  ) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.find', { userId, userRole, status, clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async invoiceStats(@Args('userId') userId: string, @Args('userRole') userRole: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.stats', { userId, userRole, clientId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async createInvoice(@Args('input') input: any, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.create', { ...input, clientId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async updateInvoiceStatus(
    @Args('invoiceId') invoiceId: string,
    @Args('status') status: string,
    @Args('amount', { nullable: true }) amount: number,
    @Args('method', { nullable: true }) method: string,
    @ClientId() clientId: string,
    @CurrentUser() authContext: AuthContext,
  ) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.update.status', { invoiceId, status, amount, method, clientId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async generateInvoicePDF(@Args('invoiceId') invoiceId: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.generate.pdf', { invoiceId, clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async featureFlags(@ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const result = await firstValueFrom(
      this.flagsClient.send('flags.get.all', { clientId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async evaluateFeatureFlag(
    @Args('flagKey') flagKey: string,
    @Args('orgType', { nullable: true }) orgType: string,
    @Args('orgId', { nullable: true }) orgId: string,
    @Args('userId', { nullable: true }) userId: string,
    @ClientId() clientId: string,
    @CurrentUser() authContext: AuthContext,
  ) {
    const context = {
      orgType: orgType || authContext.organization.type,
      orgId: orgId || authContext.organization.id,
      userId: userId || authContext.user.id,
      clientId,
    };
    const result = await firstValueFrom(
      this.flagsClient.send('flags.evaluate', { flagKey, context }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async placeOrder(@Args('input') input: any, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    try {
      console.log('Dashboard resolver: Placing order for', { restaurantId, clientId, input });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.place', { restaurantId, clientId, ...input }),
      );
      console.log('Dashboard resolver: Order placed result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error placing order', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  // Multi-tenant order queries
  @Query(() => String)
  async myOrders(@Args('filter', { nullable: true }) filter: any, @Args('pagination', { nullable: true }) pagination: any, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
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
  async order(@Args('id') id: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Fetching order by ID', { clientId, orderId: id });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.get-by-id', { clientId, orderId: id }),
      );
      console.log('Dashboard resolver: Order result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error fetching order', error);
      return JSON.stringify({ error: error.message });
    }
  }

  // Multi-tenant order mutations
  @Mutation(() => String)
  async placeOrderMultiTenant(@Args('input') input: any, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    const restaurantId = authContext.user.organizationId;
    try {
      console.log('Dashboard resolver: Placing multi-tenant order', { clientId, restaurantId, input, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.place', { clientId, restaurantId, input, idempotencyKey }),
      );
      console.log('Dashboard resolver: Multi-tenant order placed result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error placing multi-tenant order', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  }

  @Mutation(() => String)
  async supplierAcknowledge(@Args('orderId') orderId: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Supplier acknowledging order', { clientId, orderId, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.acknowledge', { clientId, orderId, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order acknowledged result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error acknowledging order', error);
      return JSON.stringify({ error: error.message });
    }
  }

  @Mutation(() => String)
  async supplierSetPreparing(@Args('orderId') orderId: string, @Args('note', { nullable: true }) note: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Supplier set preparing', { clientId, orderId, note, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.preparing', { clientId, orderId, note, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order set preparing result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error setting order preparing', error);
      return JSON.stringify({ error: error.message });
    }
  }

  @Mutation(() => String)
  async supplierDispatch(@Args('orderId') orderId: string, @Args('carrier', { nullable: true }) carrier: string, @Args('driverName', { nullable: true }) driverName: string, @Args('driverPhone', { nullable: true }) driverPhone: string, @Args('etaAt', { nullable: true }) etaAt: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Supplier dispatching order', { clientId, orderId, carrier, driverName, driverPhone, etaAt, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.dispatch', { clientId, orderId, carrier, driverName, driverPhone, etaAt, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order dispatched result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error dispatching order', error);
      return JSON.stringify({ error: error.message });
    }
  }

  @Mutation(() => String)
  async supplierMarkDelivered(@Args('orderId') orderId: string, @Args('proofUrl', { nullable: true }) proofUrl: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Supplier marking order delivered', { clientId, orderId, proofUrl, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.delivered', { clientId, orderId, proofUrl, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order delivered result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error marking order delivered', error);
      return JSON.stringify({ error: error.message });
    }
  }

  @Mutation(() => String)
  async cancelOrder(@Args('orderId') orderId: string, @Args('reason') reason: string, @Args('idempotencyKey') idempotencyKey: string, @ClientId() clientId: string, @CurrentUser() authContext: AuthContext) {
    try {
      console.log('Dashboard resolver: Cancelling order', { clientId, orderId, reason, idempotencyKey });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.multi-tenant.cancel', { clientId, orderId, reason, idempotencyKey }),
      );
      console.log('Dashboard resolver: Order cancelled result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error cancelling order', error);
      return JSON.stringify({ error: error.message });
    }
  }
}
