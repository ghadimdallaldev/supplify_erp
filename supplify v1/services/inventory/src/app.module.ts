import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { MovementsModule } from './movements/movements.module';
import { CountsModule } from './counts/counts.module';
import { ItemsModule } from './items/items.module';
import { RecipesModule } from './recipes/recipes.module';
import { EventsModule } from './events/events.module';
import { JobsModule } from './jobs/jobs.module';
import { GraphQLModule } from './graphql/graphql.module';
import { AutoSyncModule } from './auto-sync/auto-sync.module';
import { BulkUploadModule } from './bulk-upload/bulk-upload.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    CommonModule,
    MovementsModule,
    CountsModule,
    ItemsModule,
    RecipesModule,
    EventsModule,
    JobsModule,
    GraphQLModule,
    AutoSyncModule,
    BulkUploadModule,
    InventoryModule,
  ],
})
export class AppModule {}

