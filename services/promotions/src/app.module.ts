import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma/prisma.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { AdsEngineModule } from './ads-engine/ads-engine.module';
import { StatsModule } from './stats/stats.module';
import { PromoSuiteModule } from './promosuite/promosuite.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ClientsModule.register([
      {
        name: 'RABBITMQ_SERVICE',
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
    PrismaModule,
    CampaignsModule,
    AdsEngineModule,
    StatsModule,
    PromoSuiteModule,
  ],
})
export class AppModule {}