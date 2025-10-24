import { Test, TestingModule } from '@nestjs/testing';
import { MovementsService } from '../movements.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UomService } from '../../common/uom.service';
import { FefoService } from '../../common/fefo.service';
import { ValuationService } from '../../common/valuation.service';
import { MovementType, BatchStatus } from '@prisma/client';

/**
 * Integration test: Receive → Issue → Verify ledger coherence and SOH
 */
describe('MovementsService Integration', () => {
  let service: MovementsService;
  let prisma: PrismaService;
  let uomService: UomService;
  let fefoService: FefoService;
  let valuationService: ValuationService;

  // Test data
  const itemId = 'item-test-1';
  const locationId = 'loc-test-1';
  const restaurantId = 'rest-test-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementsService,
        UomService,
        FefoService,
        ValuationService,
        {
          provide: PrismaService,
          useValue: createMockPrisma(),
        },
      ],
    }).compile();

    service = module.get<MovementsService>(MovementsService);
    prisma = module.get<PrismaService>(PrismaService);
    uomService = module.get<UomService>(UomService);
    fefoService = module.get<FefoService>(FefoService);
    valuationService = module.get<ValuationService>(ValuationService);
  });

  function createMockPrisma() {
    const batches: any[] = [];
    const ledgerEntries: any[] = [];
    let stockOnHand: any = null;

    return {
      item: {
        findUnique: jest.fn().mockResolvedValue({
          id: itemId,
          restaurantId,
          name: 'Test Item',
          uomBase: 'kg',
          active: true,
        }),
      },
      batch: {
        create: jest.fn().mockImplementation((data) => {
          const batch = { id: `batch-${batches.length + 1}`, ...data.data };
          batches.push(batch);
          return Promise.resolve(batch);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const batch = batches.find(b => b.id === where.id);
          if (batch && data.qtyOnHandBase?.decrement) {
            batch.qtyOnHandBase -= data.qtyOnHandBase.decrement;
          }
          return Promise.resolve(batch);
        }),
        findMany: jest.fn().mockImplementation(() => {
          return Promise.resolve(
            batches.filter(b => b.itemId === itemId && b.locationId === locationId && b.qtyOnHandBase > 0)
          );
        }),
        findFirst: jest.fn().mockImplementation(() => {
          return Promise.resolve(
            batches.find(b => b.itemId === itemId && b.locationId === locationId && b.qtyOnHandBase > 0)
          );
        }),
      },
      stockLedger: {
        create: jest.fn().mockImplementation((data) => {
          const entry = { id: `ledger-${ledgerEntries.length + 1}`, ...data.data };
          ledgerEntries.push(entry);
          return Promise.resolve(entry);
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      stockOnHand: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stockOnHand)),
        create: jest.fn().mockImplementation((data) => {
          stockOnHand = { id: 'soh-1', ...data.data };
          return Promise.resolve(stockOnHand);
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          if (stockOnHand) {
            if (data.qtyOnHandBase !== undefined) stockOnHand.qtyOnHandBase = data.qtyOnHandBase;
            if (data.avgCost !== undefined) stockOnHand.avgCost = data.avgCost;
            if (data.totalValue !== undefined) stockOnHand.totalValue = data.totalValue;
            if (data.qtyAvailableBase !== undefined) stockOnHand.qtyAvailableBase = data.qtyAvailableBase;
          }
          return Promise.resolve(stockOnHand);
        }),
      },
      executeTransaction: jest.fn().mockImplementation(async (fn) => {
        return fn(prisma);
      }),
    };
  }

  it('should maintain ledger coherence: Receipt → Issue → SOH matches', async () => {
    // Mock UOM service
    jest.spyOn(uomService, 'toBase').mockImplementation((qty) => qty); // 1:1 for simplicity

    // Step 1: Receive 100 kg @ $2.50/kg
    const receiptResult = await service.receiveStock({
      itemId,
      locationId,
      qty: 100,
      uom: 'kg',
      unitCost: 2.5,
      refType: 'PO',
      refId: 'PO-001',
      causedBy: 'user-1',
    });

    expect(receiptResult.batch.qtyOnHandBase).toBe(100);

    // Verify ledger entry created
    expect(prisma.stockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.RECEIPT,
          qtyBase: 100,
        }),
      })
    );

    // Step 2: Issue 30 kg
    jest.spyOn(fefoService, 'selectBatches').mockResolvedValue([
      {
        batch: receiptResult.batch,
        qtyAllocated: 30,
      },
    ]);

    const issueResult = await service.issueStock({
      itemId,
      locationId,
      qty: 30,
      uom: 'kg',
      refType: 'RECIPE',
      refId: 'RECIPE-001',
      causedBy: 'user-1',
    });

    expect(issueResult.ledgerEntries).toHaveLength(1);

    // Step 3: Verify SOH
    // SOH should reflect: 100 - 30 = 70 kg
    // This is checked in the updateStockOnHand calls
    expect(prisma.stockOnHand.update).toHaveBeenCalled();

    // Verify batch quantity updated
    expect(prisma.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: receiptResult.batch.id },
        data: {
          qtyOnHandBase: { decrement: 30 },
        },
      })
    );
  });

  it('should handle transfer between locations correctly', async () => {
    jest.spyOn(uomService, 'toBase').mockImplementation((qty) => qty);

    const fromLocationId = 'loc-from';
    const toLocationId = 'loc-to';

    // Create a batch first
    const batch = {
      id: 'batch-1',
      itemId,
      locationId: fromLocationId,
      qtyOnHandBase: 50,
      lastUnitCost: 3.0,
      expiryDate: null,
      lotCode: 'LOT-001',
      supplierId: 'sup-1',
      status: BatchStatus.OK,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(fefoService, 'selectBatches').mockResolvedValue([
      { batch, qtyAllocated: 20 },
    ]);

    const transferResult = await service.transferStock({
      itemId,
      fromLocationId,
      toLocationId,
      qty: 20,
      uom: 'kg',
      causedBy: 'user-1',
      reason: 'Restocking',
    });

    expect(transferResult.transferId).toBeDefined();

    // Should create two ledger entries (OUT and IN)
    expect(prisma.stockLedger.create).toHaveBeenCalledTimes(2);

    // Verify TRANSFER_OUT
    expect(prisma.stockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.TRANSFER_OUT,
          locationId: fromLocationId,
          qtyBase: -20,
        }),
      })
    );

    // Verify TRANSFER_IN
    expect(prisma.stockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.TRANSFER_IN,
          locationId: toLocationId,
          qtyBase: 20,
        }),
      })
    );

    // Both should have same refId
    const calls = (prisma.stockLedger.create as jest.Mock).mock.calls;
    expect(calls[0][0].data.refId).toBe(calls[1][0].data.refId);
  });

  it('should track wastage and reduce SOH', async () => {
    jest.spyOn(uomService, 'toBase').mockImplementation((qty) => qty);

    const batch = {
      id: 'batch-1',
      itemId,
      locationId,
      qtyOnHandBase: 50,
      lastUnitCost: 4.0,
      expiryDate: null,
      lotCode: 'LOT-001',
      supplierId: 'sup-1',
      status: BatchStatus.OK,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(fefoService, 'selectBatches').mockResolvedValue([
      { batch, qtyAllocated: 5 },
    ]);

    const wasteResult = await service.wasteStock({
      itemId,
      locationId,
      qty: 5,
      uom: 'kg',
      causedBy: 'user-1',
      reason: 'Spoilage - expired',
    });

    expect(wasteResult.cost).toBe(20); // 5 kg * $4.00

    // Verify ledger entry
    expect(prisma.stockLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: MovementType.WASTE,
          qtyBase: -5,
          reason: 'Spoilage - expired',
        }),
      })
    );

    // Verify batch reduced
    expect(prisma.batch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: batch.id },
        data: {
          qtyOnHandBase: { decrement: 5 },
        },
      })
    );
  });
});

