import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DashboardResolver } from './dashboard.resolver';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'ORDERS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'orders_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'INVENTORY_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'inventory_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'LOYALTY_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'loyalty_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'SUPPLIERS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'suppliers_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'INVOICING_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'invoicing_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'FLAGS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'flags_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  providers: [DashboardResolver],
  exports: [DashboardResolver],
})
export class DashboardModule {}
