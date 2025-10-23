import { Module } from '@nestjs/common';
import { AutoSyncInventoryService } from './auto-sync-inventory.service';
import { OrganizationSettingsService } from './organization-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';

@Module({
  providers: [
    AutoSyncInventoryService,
    OrganizationSettingsService,
    PrismaService,
    MovementsService,
  ],
  exports: [
    AutoSyncInventoryService,
    OrganizationSettingsService,
  ],
})
export class AutoSyncModule {}
