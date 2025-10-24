import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Resolver()
export class SubscriptionsResolver {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Subscription(() => String, {
    resolve: (payload) => JSON.stringify(payload),
  })
  orderUpdated(@Args('orderId') orderId: string) {
    return this.subscriptionsService.getOrderUpdatedStream(orderId);
  }

  @Subscription(() => String, {
    resolve: (payload) => JSON.stringify(payload),
  })
  orderEventAppended(@Args('orderId') orderId: string) {
    return this.subscriptionsService.getOrderEventStream(orderId);
  }

  @Subscription(() => String, {
    resolve: (payload) => JSON.stringify(payload),
  })
  orderMessageAdded(@Args('orderId') orderId: string) {
    return this.subscriptionsService.getOrderMessageStream(orderId);
  }
}
