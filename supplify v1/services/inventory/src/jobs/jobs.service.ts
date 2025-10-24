import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { FefoService } from '../common/fefo.service';
import { ValuationService } from '../common/valuation.service';
import { ValuationMethod, StorageType } from '@prisma/client';
import { differenceInDays } from 'date-fns';

/**
 * Background Jobs Service
 * Scheduled tasks for inventory management
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private events: EventsService,
    private fefo: FefoService,
    private valuation: ValuationService,
  ) {}

  /**
   * Check for low stock and emit alerts
   * Runs daily at 7:00 AM
   */
  @Cron('0 7 * * *', {
    name: 'check-low-stock',
    timeZone: 'UTC',
  })
  async checkLowStock() {
    this.logger.log('Running low stock check...');

    try {
      // Get all par configs
      const parConfigs = await this.prisma.parConfig.findMany({
        include: {
          item: true,
          location: true,
        },
      });

      let alertsCreated = 0;

      for (const par of parConfigs) {
        // Get current stock on hand
        const soh = await this.prisma.stockOnHand.findUnique({
          where: {
            itemId_locationId: {
              itemId: par.itemId,
              locationId: par.locationId,
            },
          },
        });

        if (soh && soh.qtyAvailableBase <= par.reorderPoint) {
          // Create alert
          const existing = await this.prisma.alert.findFirst({
            where: {
              alertType: 'LOW_STOCK',
              itemId: par.itemId,
              locationId: par.locationId,
              acknowledged: false,
              createdAt: {
                gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24h
              },
            },
          });

          if (!existing) {
            await this.prisma.alert.create({
              data: {
                restaurantId: par.item.restaurantId,
                alertType: 'LOW_STOCK',
                severity: soh.qtyAvailableBase <= par.minPar ? 'CRITICAL' : 'WARNING',
                itemId: par.itemId,
                locationId: par.locationId,
                message: `Stock below reorder point: ${soh.qtyAvailableBase.toFixed(2)} ${par.item.uomBase} available, reorder at ${par.reorderPoint}`,
                metadata: {
                  qtyAvailable: soh.qtyAvailableBase,
                  reorderPoint: par.reorderPoint,
                  reorderQty: par.reorderQty,
                },
              },
            });

            // Emit event
            await this.events.lowStock({
              restaurantId: par.item.restaurantId,
              itemId: par.itemId,
              itemName: par.item.name,
              locationId: par.locationId,
              locationName: par.location.name,
              qtyAvailable: soh.qtyAvailableBase,
              reorderPoint: par.reorderPoint,
            });

            alertsCreated++;
          }
        }
      }

      this.logger.log(`Low stock check complete: ${alertsCreated} new alerts created`);
    } catch (error) {
      this.logger.error('Error in low stock check:', error);
    }
  }

  /**
   * Check for near-expiry items
   * Runs daily at 8:00 AM
   */
  @Cron('0 8 * * *', {
    name: 'check-expiry',
    timeZone: 'UTC',
  })
  async checkExpiry() {
    this.logger.log('Running expiry check...');

    try {
      // Different horizons for different storage types
      const horizons = {
        [StorageType.CHILL]: 7,
        [StorageType.DRY]: 30,
        [StorageType.FREEZE]: 30,
        [StorageType.CHEMICAL]: 90,
      };

      let alertsCreated = 0;

      for (const [storageType, days] of Object.entries(horizons)) {
        const expiringBatches = await this.fefo.getExpiringBatches(
          'all', // We'll filter per restaurant
          days,
          storageType,
        );

        for (const batch of expiringBatches) {
          const daysUntilExpiry = batch.expiryDate
            ? differenceInDays(batch.expiryDate, new Date())
            : 999;

          // Check if alert already exists
          const existing = await this.prisma.alert.findFirst({
            where: {
              alertType: 'NEAR_EXPIRY',
              batchId: batch.id,
              acknowledged: false,
            },
          });

          if (!existing) {
            const severity = daysUntilExpiry <= 2 ? 'CRITICAL' : 'WARNING';

            await this.prisma.alert.create({
              data: {
                restaurantId: batch.item.restaurantId,
                alertType: 'NEAR_EXPIRY',
                severity,
                itemId: batch.itemId,
                locationId: batch.locationId,
                batchId: batch.id,
                message: `Batch expiring in ${daysUntilExpiry} days: ${batch.item.name} (${batch.qtyOnHandBase} ${batch.item.uomBase})`,
                metadata: {
                  expiryDate: batch.expiryDate,
                  daysUntilExpiry,
                  lotCode: batch.lotCode,
                  qty: batch.qtyOnHandBase,
                },
              },
            });

            // Emit event
            if (batch.expiryDate) {
              await this.events.nearExpiry({
                restaurantId: batch.item.restaurantId,
                itemId: batch.itemId,
                itemName: batch.item.name,
                batchId: batch.id,
                locationId: batch.locationId,
                expiryDate: batch.expiryDate,
                qty: batch.qtyOnHandBase,
                daysUntilExpiry,
              });
            }

            alertsCreated++;
          }
        }
      }

      this.logger.log(`Expiry check complete: ${alertsCreated} new alerts created`);
    } catch (error) {
      this.logger.error('Error in expiry check:', error);
    }
  }

  /**
   * Create monthly valuation snapshot
   * Runs on the 1st of each month at 2:00 AM
   */
  @Cron('0 2 1 * *', {
    name: 'monthly-valuation',
    timeZone: 'UTC',
  })
  async createMonthlyValuation() {
    this.logger.log('Creating monthly valuation snapshots...');

    try {
      // Get all unique restaurant IDs
      const restaurants = await this.prisma.item.findMany({
        select: { restaurantId: true },
        distinct: ['restaurantId'],
      });

      for (const { restaurantId } of restaurants) {
        // Create WAVG snapshot
        await this.valuation.createSnapshot(restaurantId, ValuationMethod.WAVG);

        // Create FIFO snapshot
        await this.valuation.createSnapshot(restaurantId, ValuationMethod.FIFO);

        this.logger.log(`Created valuation snapshots for restaurant ${restaurantId}`);
      }

      this.logger.log('Monthly valuation complete');
    } catch (error) {
      this.logger.error('Error in monthly valuation:', error);
    }
  }

  /**
   * Clean up old batches with zero quantity
   * Runs weekly on Sunday at 3:00 AM
   */
  @Cron('0 3 * * 0', {
    name: 'cleanup-batches',
    timeZone: 'UTC',
  })
  async cleanupBatches() {
    this.logger.log('Cleaning up empty batches...');

    try {
      // Delete batches older than 30 days with zero quantity
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const result = await this.prisma.batch.deleteMany({
        where: {
          qtyOnHandBase: 0,
          updatedAt: {
            lte: cutoffDate,
          },
        },
      });

      this.logger.log(`Cleaned up ${result.count} empty batches`);
    } catch (error) {
      this.logger.error('Error in batch cleanup:', error);
    }
  }
}

