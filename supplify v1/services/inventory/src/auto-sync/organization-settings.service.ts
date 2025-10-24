import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface OrganizationSettingsDto {
  clientId: string;
  inventoryAutoReceiveMode: 'DISPATCHED' | 'DELIVERED';
  defaultExpiryWindows: {
    CHILL: number;
    DRY: number;
    FREEZE: number;
  };
  inventoryAutoSyncEnabled: boolean;
}

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(private prisma: PrismaService) {}

  async getSettings(clientId: string) {
    let settings = await this.prisma.organizationSettings.findUnique({
      where: { clientId },
    });

    if (!settings) {
      // Create default settings
      settings = await this.createDefaultSettings(clientId);
    }

    return settings;
  }

  async updateSettings(clientId: string, dto: Partial<OrganizationSettingsDto>) {
    const settings = await this.prisma.organizationSettings.upsert({
      where: { clientId },
      create: {
        clientId,
        inventoryAutoReceiveMode: dto.inventoryAutoReceiveMode || 'DELIVERED',
        defaultExpiryWindows: dto.defaultExpiryWindows || {
          CHILL: 7,
          DRY: 30,
          FREEZE: 30,
        },
        inventoryAutoSyncEnabled: dto.inventoryAutoSyncEnabled ?? true,
      },
      update: {
        inventoryAutoReceiveMode: dto.inventoryAutoReceiveMode,
        defaultExpiryWindows: dto.defaultExpiryWindows,
        inventoryAutoSyncEnabled: dto.inventoryAutoSyncEnabled,
      },
    });

    this.logger.log(`Updated organization settings for client ${clientId}`);
    return settings;
  }

  private async createDefaultSettings(clientId: string) {
    const settings = await this.prisma.organizationSettings.create({
      data: {
        clientId,
        inventoryAutoReceiveMode: 'DELIVERED',
        defaultExpiryWindows: {
          CHILL: 7,
          DRY: 30,
          FREEZE: 30,
        },
        inventoryAutoSyncEnabled: true,
      },
    });

    this.logger.log(`Created default settings for client ${clientId}`);
    return settings;
  }

  async isAutoSyncEnabled(clientId: string): Promise<boolean> {
    const settings = await this.getSettings(clientId);
    return settings.inventoryAutoSyncEnabled;
  }

  async getAutoReceiveMode(clientId: string): Promise<'DISPATCHED' | 'DELIVERED'> {
    const settings = await this.getSettings(clientId);
    return settings.inventoryAutoReceiveMode as 'DISPATCHED' | 'DELIVERED';
  }
}
