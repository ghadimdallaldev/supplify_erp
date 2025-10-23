import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UomService } from '../common/uom.service';
import { FefoService } from '../common/fefo.service';
import { ValuationService } from '../common/valuation.service';
import { MovementType, BatchStatus, Prisma } from '@prisma/client';
import {
  ReceiveStockDto,
  IssueStockDto,
  TransferStockDto,
  WasteStockDto,
  AdjustStockDto,
} from './dto/movement.dto';

/**
 * Stock Movements Service
 * Core service for all inventory movements with FEFO logic and auditability
 */
@Injectable()
export class MovementsService {
  constructor(
    private prisma: PrismaService,
    private uomService: UomService,
    private fefoService: FefoService,
    private valuationService: ValuationService,
  ) {}

  /**
   * Receive stock into inventory
   * Creates a new batch and ledger entry
   */
  async receiveStock(dto: ReceiveStockDto) {
    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockLedger.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Duplicate receipt - already processed');
      }
    }

    // Get item and validate
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });

    if (!item || !item.active) {
      throw new BadRequestException('Item not found or inactive');
    }

    // Convert to base UOM
    const qtyBase = this.uomService.toBase(dto.qty, dto.uom);

    return this.prisma.executeTransaction(async (tx) => {
      // Create new batch
      const batch = await tx.batch.create({
        data: {
          itemId: dto.itemId,
          locationId: dto.locationId,
          qtyOnHandBase: qtyBase,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          lotCode: dto.lotCode,
          supplierId: dto.supplierId,
          lastUnitCost: dto.unitCost,
          status: BatchStatus.OK,
        },
      });

      // Create ledger entry
      const ledgerEntry = await tx.stockLedger.create({
        data: {
          itemId: dto.itemId,
          restaurantId: item.restaurantId,
          locationId: dto.locationId,
          batchId: batch.id,
          movementType: MovementType.RECEIPT,
          qtyBase,
          uomBase: item.uomBase,
          unitCost: dto.unitCost,
          extCost: qtyBase * dto.unitCost,
          refType: dto.refType,
          refId: dto.refId,
          causedBy: dto.causedBy,
          reason: dto.reason,
          metadata: dto.metadata as Prisma.JsonObject,
          idempotencyKey: dto.idempotencyKey,
          timestamp: new Date(),
        },
      });

      // Update or create stock on hand
      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.locationId,
        item.restaurantId,
        qtyBase,
        dto.unitCost,
      );

      return {
        batch,
        ledgerEntry,
        message: 'Stock received successfully',
      };
    });
  }

  /**
   * Issue (consume) stock using FEFO logic
   */
  async issueStock(dto: IssueStockDto) {
    // Check idempotency
    if (dto.idempotencyKey) {
      const existing = await this.prisma.stockLedger.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new ConflictException('Duplicate issue - already processed');
      }
    }

    // Get item
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });

    if (!item || !item.active) {
      throw new BadRequestException('Item not found or inactive');
    }

    // Convert to base UOM
    const qtyBase = this.uomService.toBase(dto.qty, dto.uom);

    // Select batches using FEFO
    const batchAllocations = await this.fefoService.selectBatches(
      dto.itemId,
      dto.locationId,
      qtyBase,
      dto.allowNegative,
    );

    return this.prisma.executeTransaction(async (tx) => {
      const ledgerEntries = [];

      // Issue from each batch
      for (const allocation of batchAllocations) {
        // Update batch quantity
        await tx.batch.update({
          where: { id: allocation.batch.id },
          data: {
            qtyOnHandBase: { decrement: allocation.qtyAllocated },
          },
        });

        // Create ledger entry
        const ledgerEntry = await tx.stockLedger.create({
          data: {
            itemId: dto.itemId,
            restaurantId: item.restaurantId,
            locationId: dto.locationId,
            batchId: allocation.batch.id,
            movementType: MovementType.ISSUE,
            qtyBase: -allocation.qtyAllocated,
            uomBase: item.uomBase,
            unitCost: allocation.batch.lastUnitCost,
            extCost: -(allocation.qtyAllocated * allocation.batch.lastUnitCost),
            refType: dto.refType,
            refId: dto.refId,
            causedBy: dto.causedBy,
            reason: dto.reason,
            metadata: dto.metadata as Prisma.JsonObject,
            idempotencyKey: dto.idempotencyKey,
            timestamp: new Date(),
          },
        });

        ledgerEntries.push(ledgerEntry);
      }

      // Update stock on hand
      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.locationId,
        item.restaurantId,
        -qtyBase,
        null,
      );

      return {
        ledgerEntries,
        batchesAffected: batchAllocations.length,
        message: 'Stock issued successfully',
      };
    });
  }

  /**
   * Transfer stock between locations
   */
  async transferStock(dto: TransferStockDto) {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new BadRequestException('Cannot transfer to the same location');
    }

    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    const qtyBase = this.uomService.toBase(dto.qty, dto.uom);

    // Select batches from source location using FEFO
    const batchAllocations = await this.fefoService.selectBatches(
      dto.itemId,
      dto.fromLocationId,
      qtyBase,
    );

    return this.prisma.executeTransaction(async (tx) => {
      const transferId = `XFER-${Date.now()}`;

      // Process each batch
      for (const allocation of batchAllocations) {
        // Decrease from source batch
        await tx.batch.update({
          where: { id: allocation.batch.id },
          data: {
            qtyOnHandBase: { decrement: allocation.qtyAllocated },
          },
        });

        // Create TRANSFER_OUT ledger entry
        await tx.stockLedger.create({
          data: {
            itemId: dto.itemId,
            restaurantId: item.restaurantId,
            locationId: dto.fromLocationId,
            batchId: allocation.batch.id,
            movementType: MovementType.TRANSFER_OUT,
            qtyBase: -allocation.qtyAllocated,
            uomBase: item.uomBase,
            unitCost: allocation.batch.lastUnitCost,
            extCost: -(allocation.qtyAllocated * allocation.batch.lastUnitCost),
            refType: 'TRANSFER',
            refId: transferId,
            causedBy: dto.causedBy,
            reason: dto.reason,
            metadata: dto.metadata as Prisma.JsonObject,
            timestamp: new Date(),
          },
        });

        // Create new batch at destination
        const newBatch = await tx.batch.create({
          data: {
            itemId: dto.itemId,
            locationId: dto.toLocationId,
            qtyOnHandBase: allocation.qtyAllocated,
            expiryDate: allocation.batch.expiryDate,
            lotCode: allocation.batch.lotCode,
            supplierId: allocation.batch.supplierId,
            lastUnitCost: allocation.batch.lastUnitCost,
            status: BatchStatus.OK,
          },
        });

        // Create TRANSFER_IN ledger entry
        await tx.stockLedger.create({
          data: {
            itemId: dto.itemId,
            restaurantId: item.restaurantId,
            locationId: dto.toLocationId,
            batchId: newBatch.id,
            movementType: MovementType.TRANSFER_IN,
            qtyBase: allocation.qtyAllocated,
            uomBase: item.uomBase,
            unitCost: allocation.batch.lastUnitCost,
            extCost: allocation.qtyAllocated * allocation.batch.lastUnitCost,
            refType: 'TRANSFER',
            refId: transferId,
            causedBy: dto.causedBy,
            reason: dto.reason,
            metadata: dto.metadata as Prisma.JsonObject,
            timestamp: new Date(),
          },
        });
      }

      // Update stock on hand for both locations
      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.fromLocationId,
        item.restaurantId,
        -qtyBase,
        null,
      );

      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.toLocationId,
        item.restaurantId,
        qtyBase,
        batchAllocations[0]?.batch.lastUnitCost || 0,
      );

      return {
        transferId,
        message: 'Stock transferred successfully',
      };
    });
  }

  /**
   * Record wastage
   */
  async wasteStock(dto: WasteStockDto) {
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    const qtyBase = this.uomService.toBase(dto.qty, dto.uom);

    // Select batches using FEFO (waste oldest first)
    const batchAllocations = await this.fefoService.selectBatches(
      dto.itemId,
      dto.locationId,
      qtyBase,
    );

    return this.prisma.executeTransaction(async (tx) => {
      for (const allocation of batchAllocations) {
        await tx.batch.update({
          where: { id: allocation.batch.id },
          data: {
            qtyOnHandBase: { decrement: allocation.qtyAllocated },
          },
        });

        await tx.stockLedger.create({
          data: {
            itemId: dto.itemId,
            restaurantId: item.restaurantId,
            locationId: dto.locationId,
            batchId: allocation.batch.id,
            movementType: MovementType.WASTE,
            qtyBase: -allocation.qtyAllocated,
            uomBase: item.uomBase,
            unitCost: allocation.batch.lastUnitCost,
            extCost: -(allocation.qtyAllocated * allocation.batch.lastUnitCost),
            refType: 'WASTE',
            causedBy: dto.causedBy,
            reason: dto.reason,
            metadata: dto.metadata as Prisma.JsonObject,
            idempotencyKey: dto.idempotencyKey,
            timestamp: new Date(),
          },
        });
      }

      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.locationId,
        item.restaurantId,
        -qtyBase,
        null,
      );

      return {
        message: 'Wastage recorded successfully',
        cost: batchAllocations.reduce(
          (sum, a) => sum + a.qtyAllocated * a.batch.lastUnitCost,
          0,
        ),
      };
    });
  }

  /**
   * Adjust stock (for count variances)
   */
  async adjustStock(dto: AdjustStockDto) {
    const item = await this.prisma.item.findUnique({
      where: { id: dto.itemId },
    });

    if (!item) {
      throw new BadRequestException('Item not found');
    }

    const qtyBase = this.uomService.toBase(Math.abs(dto.qtyAdjustment), dto.uom);
    const adjustmentQty = dto.qtyAdjustment > 0 ? qtyBase : -qtyBase;

    return this.prisma.executeTransaction(async (tx) => {
      let batchId: string | null = null;

      if (dto.qtyAdjustment > 0) {
        // Positive adjustment - create a new batch
        const batch = await tx.batch.create({
          data: {
            itemId: dto.itemId,
            locationId: dto.locationId,
            qtyOnHandBase: qtyBase,
            lastUnitCost: 0, // Adjustment batches have zero cost
            status: BatchStatus.OK,
          },
        });
        batchId = batch.id;
      } else {
        // Negative adjustment - use FEFO to select batches
        const batchAllocations = await this.fefoService.selectBatches(
          dto.itemId,
          dto.locationId,
          qtyBase,
        );

        if (batchAllocations.length > 0) {
          batchId = batchAllocations[0].batch.id;

          for (const allocation of batchAllocations) {
            await tx.batch.update({
              where: { id: allocation.batch.id },
              data: {
                qtyOnHandBase: { decrement: allocation.qtyAllocated },
              },
            });
          }
        }
      }

      const ledgerEntry = await tx.stockLedger.create({
        data: {
          itemId: dto.itemId,
          restaurantId: item.restaurantId,
          locationId: dto.locationId,
          batchId,
          movementType: MovementType.ADJUSTMENT,
          qtyBase: adjustmentQty,
          uomBase: item.uomBase,
          unitCost: 0,
          extCost: 0,
          refType: dto.refType || 'ADJUSTMENT',
          refId: dto.refId,
          causedBy: dto.causedBy,
          reason: dto.reason,
          metadata: dto.metadata as Prisma.JsonObject,
          idempotencyKey: dto.idempotencyKey,
          timestamp: new Date(),
        },
      });

      await this.updateStockOnHand(
        tx,
        dto.itemId,
        dto.locationId,
        item.restaurantId,
        adjustmentQty,
        null,
      );

      return {
        ledgerEntry,
        message: 'Stock adjusted successfully',
      };
    });
  }

  /**
   * Update or create stock on hand record
   * Should be called within a transaction
   */
  private async updateStockOnHand(
    tx: any,
    itemId: string,
    locationId: string,
    restaurantId: string,
    qtyChange: number,
    newUnitCost: number | null,
  ) {
    const existing = await tx.stockOnHand.findUnique({
      where: {
        itemId_locationId: { itemId, locationId },
      },
    });

    if (existing) {
      let newAvgCost = existing.avgCost || 0;

      // Update weighted average cost on receipt
      if (newUnitCost !== null && qtyChange > 0) {
        newAvgCost = this.valuationService.calculateWeightedAvgCost(
          existing.qtyOnHandBase,
          existing.avgCost || 0,
          qtyChange,
          newUnitCost,
        );
      }

      const newQty = existing.qtyOnHandBase + qtyChange;

      await tx.stockOnHand.update({
        where: {
          itemId_locationId: { itemId, locationId },
        },
        data: {
          qtyOnHandBase: newQty,
          qtyAvailableBase: newQty - existing.qtyCommittedBase,
          lastCost: newUnitCost || existing.lastCost,
          avgCost: newAvgCost,
          totalValue: newQty * newAvgCost,
          lastMovementAt: new Date(),
        },
      });
    } else {
      // Create new stock on hand record
      await tx.stockOnHand.create({
        data: {
          itemId,
          locationId,
          restaurantId,
          qtyOnHandBase: qtyChange,
          qtyCommittedBase: 0,
          qtyAvailableBase: qtyChange,
          lastCost: newUnitCost || 0,
          avgCost: newUnitCost || 0,
          totalValue: qtyChange * (newUnitCost || 0),
          lastMovementAt: new Date(),
        },
      });
    }
  }
}

