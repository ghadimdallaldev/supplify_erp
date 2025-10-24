import { Module } from '@nestjs/common';
import { AutoSyncInventoryService } from './auto-sync-inventory.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsModule } from '../movements/movements.module';

@Module({
  imports: [MovementsModule],
  providers: [
    AutoSyncInventoryService,
    OrganizationSettingsService,
    PrismaService,
  ],
  exports: [
    AutoSyncInventoryService,
    OrganizationSettingsService,
  ],
})
export class AutoSyncModule {}
