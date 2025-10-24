import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [PrismaModule, InvoicingModule, HealthModule],
})
export class AppModule {}

