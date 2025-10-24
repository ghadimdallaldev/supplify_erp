import { Test, TestingModule } from '@nestjs/testing';
import { FefoService } from '../fefo.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BatchStatus } from '@prisma/client';
import { addDays } from 'date-fns';

describe('FefoService', () => {
  let service: FefoService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FefoService,
        {
          provide: PrismaService,
          useValue: {
            batch: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FefoService>(FefoService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('selectBatches', () => {
    it('should select batch with earliest expiry first (FEFO)', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 10,
          expiryDate: addDays(new Date(), 5),
          lotCode: 'LOT-A',
          supplierId: 'sup-1',
          lastUnitCost: 2.5,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date(),
        },
        {
          id: '2',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 15,
          expiryDate: addDays(new Date(), 2), // Earlier expiry
          lotCode: 'LOT-B',
          supplierId: 'sup-1',
          lastUnitCost: 2.6,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches);

      const result = await service.selectBatches('item-1', 'loc-1', 5);

      expect(result).toHaveLength(1);
      expect(result[0].batch.id).toBe('2'); // Earlier expiry selected first
      expect(result[0].qtyAllocated).toBe(5);
    });

    it('should use FIFO when expiry dates are null', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 10,
          expiryDate: null,
          lotCode: 'LOT-A',
          supplierId: 'sup-1',
          lastUnitCost: 2.5,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date(),
        },
        {
          id: '2',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 15,
          expiryDate: null,
          lotCode: 'LOT-B',
          supplierId: 'sup-1',
          lastUnitCost: 2.6,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-01'), // Earlier creation date
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches);

      const result = await service.selectBatches('item-1', 'loc-1', 5);

      expect(result).toHaveLength(1);
      expect(result[0].batch.id).toBe('2'); // Earlier creation date selected (FIFO)
      expect(result[0].qtyAllocated).toBe(5);
    });

    it('should allocate across multiple batches when needed', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 5, // Not enough
          expiryDate: addDays(new Date(), 2),
          lotCode: 'LOT-A',
          supplierId: 'sup-1',
          lastUnitCost: 2.5,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date(),
        },
        {
          id: '2',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 10,
          expiryDate: addDays(new Date(), 5),
          lotCode: 'LOT-B',
          supplierId: 'sup-1',
          lastUnitCost: 2.6,
          status: BatchStatus.OK,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches);

      const result = await service.selectBatches('item-1', 'loc-1', 12);

      expect(result).toHaveLength(2);
      expect(result[0].batch.id).toBe('1');
      expect(result[0].qtyAllocated).toBe(5);
      expect(result[1].batch.id).toBe('2');
      expect(result[1].qtyAllocated).toBe(7);
    });

    it('should throw error when insufficient stock', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 5,
          expiryDate: null,
          lotCode: 'LOT-A',
          supplierId: 'sup-1',
          lastUnitCost: 2.5,
          status: BatchStatus.OK,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches);

      await expect(
        service.selectBatches('item-1', 'loc-1', 10)
      ).rejects.toThrow('Insufficient stock');
    });

    it('should skip batches with HOLD or QUARANTINE status', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 10,
          expiryDate: addDays(new Date(), 2),
          lotCode: 'LOT-A',
          supplierId: 'sup-1',
          lastUnitCost: 2.5,
          status: BatchStatus.OK,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Mock will only return OK batches due to where clause
      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches);

      const result = await service.selectBatches('item-1', 'loc-1', 5);

      expect(prisma.batch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: BatchStatus.OK,
          }),
        })
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('getExpiringBatches', () => {
    it('should return batches expiring within specified days', async () => {
      const expiringBatch = {
        id: '1',
        itemId: 'item-1',
        locationId: 'loc-1',
        qtyOnHandBase: 10,
        expiryDate: addDays(new Date(), 3),
        lotCode: 'LOT-A',
        supplierId: 'sup-1',
        lastUnitCost: 2.5,
        status: BatchStatus.OK,
        createdAt: new Date(),
        updatedAt: new Date(),
        item: {
          id: 'item-1',
          restaurantId: 'rest-1',
          name: 'Test Item',
          categoryId: 'cat-1',
          sku: 'SKU-001',
          barcode: null,
          allergenFlags: [],
          storageType: 'CHILL',
          uomBase: 'kg',
          uomDisplay: 'kg',
          yieldPct: null,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        location: {
          id: 'loc-1',
          restaurantId: 'rest-1',
          name: 'Kitchen',
          code: 'KITCHEN',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue([expiringBatch]);

      const result = await service.getExpiringBatches('rest-1', 7, 'CHILL');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });
});

