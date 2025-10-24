import { Module } from '@nestjs/common';

import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, ProductsModule, CategoriesModule, HealthModule],
})
export class AppModule {}

