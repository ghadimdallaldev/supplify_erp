import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PromoSuiteResolver } from './promosuite.resolver';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'PROMOTIONS_SERVICE',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://localhost:5672'],
          queue: 'promotions_queue',
          queueOptions: {
            durable: false,
          },
        },
      },
    ]),
  ],
  providers: [PromoSuiteResolver],
})
export class PromoSuiteModule {}
