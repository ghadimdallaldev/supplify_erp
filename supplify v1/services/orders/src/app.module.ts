import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, CartModule, OrdersModule, HealthModule],
})
export class AppModule {}

