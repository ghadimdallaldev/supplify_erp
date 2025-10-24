import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

@Injectable()
export class SubscriptionsService {
  private orderUpdatedSubject = new Subject<any>();
  private orderEventSubject = new Subject<any>();
  private orderMessageSubject = new Subject<any>();

  constructor(@Inject('ORDERS_SERVICE') private ordersClient: ClientProxy) {
    // Listen to RabbitMQ events and emit to GraphQL subscriptions
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // In a real implementation, you'd listen to RabbitMQ events here
    // For now, we'll create mock event emitters
    this.ordersClient.connect();
  }

  // Order updated subscription
  getOrderUpdatedStream(orderId: string) {
    return this.orderUpdatedSubject.asObservable().pipe(filter(event => event.orderId === orderId));
  }

  // Order event subscription
  getOrderEventStream(orderId: string) {
    return this.orderEventSubject.asObservable().pipe(filter(event => event.orderId === orderId));
  }

  // Order message subscription
  getOrderMessageStream(orderId: string) {
    return this.orderMessageSubject.asObservable().pipe(filter(event => event.orderId === orderId));
  }

  // Methods to emit events (called by event handlers)
  emitOrderUpdated(order: any) {
    this.orderUpdatedSubject.next(order);
  }

  emitOrderEvent(event: any) {
    this.orderEventSubject.next(event);
  }

  emitOrderMessage(message: any) {
    this.orderMessageSubject.next(message);
  }
}
