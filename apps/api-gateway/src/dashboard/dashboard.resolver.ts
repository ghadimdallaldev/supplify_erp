import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Resolver()
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
  async restaurantDashboardKpis() {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.ordersClient.send('orders.dashboard.kpis', { restaurantId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async recentOrders(@Args('limit', { nullable: true }) limit: number = 10) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    try {
      console.log('Dashboard resolver: Fetching recent orders for', { restaurantId, limit });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.recent', { restaurantId, limit }),
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
  async orders() {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    try {
      console.log('Dashboard resolver: Fetching all orders for', { restaurantId });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.search', { restaurantId }),
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
  async inventorySummary() {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.inventoryClient.send('inventory.summary', { restaurantId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async recentInventoryActivity(@Args('hours', { nullable: true }) hours: number = 24) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.inventoryClient.send('inventory.activity', { restaurantId, hours }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async myLoyaltyWallets() {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.wallets', { restaurantId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async loyaltyPrograms() {
    const result = await firstValueFrom(
      this.loyaltyClient.send('loyalty.programs', {}),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async restaurantSuppliers() {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.restaurant', { restaurantId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => Boolean)
  async redeemLoyaltyPoints(
    @Args('supplierId') supplierId: string,
    @Args('points') points: number,
    @Args('orderId') orderId: string,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
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
  async addSupplier(@Args('supplierId') supplierId: string) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.add', { restaurantId, supplierId }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async pinSupplier(
    @Args('supplierId') supplierId: string,
    @Args('pinned') pinned: boolean,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    const result = await firstValueFrom(
      this.suppliersClient.send('suppliers.pin', { restaurantId, supplierId, pinned }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async featureSupplier(
    @Args('supplierId') supplierId: string,
    @Args('featured') featured: boolean,
  ) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
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
  async createInvoice(@Args('input') input: any) {
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
  async generateInvoicePDF(@Args('invoiceId') invoiceId: string) {
    const result = await firstValueFrom(
      this.invoicingClient.send('invoices.generatePDF', { invoiceId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async featureFlags() {
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
  async placeOrder(@Args('input') input: any) {
    // TODO: Get restaurantId from context/auth
    const restaurantId = 'golden-fork';
    try {
      console.log('Dashboard resolver: Placing order for', { restaurantId, input });
      const result = await firstValueFrom(
        this.ordersClient.send('orders.place', { restaurantId, ...input }),
      );
      console.log('Dashboard resolver: Order placed result', result);
      return JSON.stringify(result);
    } catch (error) {
      console.error('Dashboard resolver: Error placing order', error);
      return JSON.stringify({ success: false, error: error.message });
    }
  }
}
