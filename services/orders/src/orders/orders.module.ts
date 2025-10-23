import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { MultiTenantOrdersService } from './multi-tenant-orders.service';
import { EventsService } from './events.service';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [
    CartModule,
    ClientsModule.register([
      {
        name: 'EVENTS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'events_queue',
          queueOptions: {
            durable: true,
          },
        },
      },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService, MultiTenantOrdersService, EventsService],
  exports: [OrdersService, MultiTenantOrdersService],
})
export class OrdersModule {}

