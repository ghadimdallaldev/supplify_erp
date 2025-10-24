import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ProductsResolver } from './products.resolver';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'CATALOG_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://supplify:supplify_dev_password@localhost:5672'],
          queue: 'catalog_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  providers: [ProductsResolver],
})
export class ProductsModule {}

