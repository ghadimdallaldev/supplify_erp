import { Resolver, Query, Args, Mutation } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Resolver()
export class OrdersResolver {
  constructor(@Inject('ORDERS_SERVICE') private ordersClient: ClientProxy) {}

  @Query(() => String)
  async orders(
    @Args('restaurantId', { nullable: true }) restaurantId?: string,
    @Args('status', { nullable: true }) status?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.search', {
        restaurantId,
        status,
      }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async order(@Args('id') id: string) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.order.find', { id }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async orderEvents(@Args('orderId') orderId: string) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.events.find', { orderId }),
    );
    return JSON.stringify(result);
  }

  @Query(() => String)
  async orderMessages(@Args('orderId') orderId: string) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.messages.find', { orderId }),
    );
    return JSON.stringify(result);
  }

  // Mutations
  @Mutation(() => String)
  async supplierAcknowledge(
    @Args('orderId') orderId: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.supplier.acknowledge', { 
        orderId, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async supplierSetPreparing(
    @Args('orderId') orderId: string,
    @Args('note', { nullable: true }) note?: string,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.supplier.preparing', { 
        orderId, 
        note, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async supplierDispatch(
    @Args('orderId') orderId: string,
    @Args('carrier', { nullable: true }) carrier?: string,
    @Args('driverName', { nullable: true }) driverName?: string,
    @Args('driverPhone', { nullable: true }) driverPhone?: string,
    @Args('etaAt', { nullable: true }) etaAt?: string,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.supplier.dispatch', { 
        orderId, 
        carrier, 
        driverName, 
        driverPhone, 
        etaAt, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async supplierMarkDelivered(
    @Args('orderId') orderId: string,
    @Args('proofUrl', { nullable: true }) proofUrl?: string,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.supplier.delivered', { 
        orderId, 
        proofUrl, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async restaurantConfirmDelivery(
    @Args('orderId') orderId: string,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.restaurant.confirm', { 
        orderId, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async cancelOrder(
    @Args('orderId') orderId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.cancel', { 
        orderId, 
        reason, 
        idempotencyKey 
      }),
    );
    return JSON.stringify(result);
  }

  @Mutation(() => String)
  async postOrderMessage(
    @Args('orderId') orderId: string,
    @Args('body') body: string,
    @Args('attachments', { type: () => [String], nullable: true }) attachments?: string[],
  ) {
    const result = await firstValueFrom(
      this.ordersClient.send('orders.message.post', { 
        orderId, 
        body, 
        attachments 
      }),
    );
    return JSON.stringify(result);
  }
}

