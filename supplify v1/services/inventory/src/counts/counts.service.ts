import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UomService } from '../common/uom.service';
import { MovementsService } from '../movements/movements.service';
import { CountStatus, CountType } from '@prisma/client';
import { StartCountDto, SubmitCountLineDto, FinalizeCountDto } from './dto/count.dto';

/**
 * Inventory Counts Service
 * Handles cycle counts and full physical inventory counts
 */
@Injectable()
export class CountsService {
  constructor(
    private prisma: PrismaService,
    private uomService: UomService,
    private movementsService: MovementsService,
  ) {}

  /**
   * Start a new inventory count
   * Freezes current system quantities as baseline
   */
  async startCount(dto: StartCountDto) {
    // Verify location exists
    const location = await this.prisma.location.findUnique({
      where: { id: dto.locationId },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return this.prisma.executeTransaction(async (tx) => {
      // Create count header
      const count = await tx.inventoryCount.create({
        data: {
          restaurantId: dto.restaurantId,
          locationId: dto.locationId,
          countType: dto.countType,
          status: CountStatus.IN_PROGRESS,
          scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
          startedAt: new Date(),
          conductedBy: dto.conductedBy,
          notes: dto.notes,
        },
      });

      // Determine which items to count
      let itemsToCount;
      
      if (dto.countType === CountType.CYCLE && dto.itemIds && dto.itemIds.length > 0) {
        // Cycle count - specific items
        itemsToCount = await tx.stockOnHand.findMany({
          where: {
            locationId: dto.locationId,
            itemId: { in: dto.itemIds },
          },
          include: { item: true },
        });
      } else {
        // Full count - all items at location
        itemsToCount = await tx.stockOnHand.findMany({
          where: {
            locationId: dto.locationId,
            qtyOnHandBase: { gt: 0 },
          },
          include: { item: true },
        });
      }

      // Create count lines with system quantities
      const countLines = await Promise.all(
        itemsToCount.map(soh =>
          tx.inventoryCountLine.create({
            data: {
              countId: count.id,
              itemId: soh.itemId,
              systemQtyBase: soh.qtyOnHandBase,
              countedQtyBase: null, // To be filled in by counters
              varianceQtyBase: null,
              varianceCost: null,
            },
          }),
        ),
      );

      return {
        count,
        linesCreated: countLines.length,
        message: `Count started with ${countLines.length} items to count`,
      };
    });
  }

  /**
   * Submit a counted quantity for an item
   */
  async submitCountLine(dto: SubmitCountLineDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id: dto.countId },
    });

    if (!count) {
      throw new NotFoundException('Count not found');
    }

    if (count.status !== CountStatus.IN_PROGRESS) {
      throw new BadRequestException('Count is not in progress');
    }

    const countLine = await this.prisma.inventoryCountLine.findUnique({
      where: {
        countId_itemId: {
          countId: dto.countId,
          itemId: dto.itemId,
        },
      },
      include: { item: true },
    });

    if (!countLine) {
      throw new NotFoundException('Count line not found');
    }

    // Convert counted qty to base UOM
    const countedQtyBase = this.uomService.toBase(dto.countedQty, dto.uom);

    // Calculate variance
    const varianceQtyBase = countedQtyBase - countLine.systemQtyBase;
    
    // Get current stock to calculate variance cost
    const stockOnHand = await this.prisma.stockOnHand.findUnique({
      where: {
        itemId_locationId: {
          itemId: dto.itemId,
          locationId: count.locationId,
        },
      },
    });

    const varianceCost = varianceQtyBase * (stockOnHand?.avgCost || 0);

    // Update count line
    return this.prisma.inventoryCountLine.update({
      where: { id: countLine.id },
      data: {
        countedQtyBase,
        varianceQtyBase,
        varianceCost,
        countedBy: dto.countedBy,
        countedAt: new Date(),
        note: dto.note,
      },
    });
  }

  /**
   * Finalize count and post adjustments
   */
  async finalizeCount(dto: FinalizeCountDto) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id: dto.countId },
      include: {
        lines: {
          include: { item: true },
        },
        location: true,
      },
    });

    if (!count) {
      throw new NotFoundException('Count not found');
    }

    if (count.status !== CountStatus.IN_PROGRESS) {
      throw new BadRequestException('Count is not in progress');
    }

    // Check all lines are counted
    const uncountedLines = count.lines.filter(line => line.countedQtyBase === null);
    if (uncountedLines.length > 0) {
      throw new BadRequestException(
        `${uncountedLines.length} items have not been counted yet`,
      );
    }

    return this.prisma.executeTransaction(async (tx) => {
      // Post adjustments for all variances
      for (const line of count.lines) {
        if (line.varianceQtyBase && line.varianceQtyBase !== 0) {
          // Post adjustment through movements service
          await this.movementsService.adjustStock({
            itemId: line.itemId,
            locationId: count.locationId,
            qtyAdjustment: line.varianceQtyBase,
            uom: line.item.uomBase,
            causedBy: dto.conductedBy,
            reason: `Count variance - Count #${count.id.substring(0, 8)}`,
            refType: 'COUNT',
            refId: count.id,
            metadata: {
              countType: count.countType,
              systemQty: line.systemQtyBase,
              countedQty: line.countedQtyBase,
              variance: line.varianceQtyBase,
            },
          });
        }
      }

      // Mark count as completed
      await tx.inventoryCount.update({
        where: { id: count.id },
        data: {
          status: CountStatus.COMPLETED,
          closedAt: new Date(),
          notes: dto.notes || count.notes,
        },
      });

      // Calculate summary statistics
      const totalVarianceCost = count.lines.reduce(
        (sum, line) => sum + (line.varianceCost || 0),
        0,
      );

      const itemsWithVariance = count.lines.filter(
        line => line.varianceQtyBase && Math.abs(line.varianceQtyBase) > 0.01,
      ).length;

      return {
        message: 'Count finalized successfully',
        summary: {
          totalItems: count.lines.length,
          itemsWithVariance,
          totalVarianceCost: Math.abs(totalVarianceCost),
          accuracyPct: ((count.lines.length - itemsWithVariance) / count.lines.length) * 100,
        },
      };
    });
  }

  /**
   * Get count details
   */
  async getCount(countId: string) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id: countId },
      include: {
        location: true,
        lines: {
          include: { item: true },
          orderBy: { item: { name: 'asc' } },
        },
      },
    });

    if (!count) {
      throw new NotFoundException('Count not found');
    }

    return count;
  }

  /**
   * Get counts for a restaurant
   */
  async getCounts(restaurantId: string, status?: CountStatus) {
    return this.prisma.inventoryCount.findMany({
      where: {
        restaurantId,
        status,
      },
      include: {
        location: true,
        _count: {
          select: { lines: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}

