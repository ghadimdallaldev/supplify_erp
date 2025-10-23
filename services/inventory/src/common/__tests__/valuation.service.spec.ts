import { Test, TestingModule } from '@nestjs/testing';
import { ValuationService } from '../valuation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ValuationMethod } from '@prisma/client';

describe('ValuationService', () => {
  let service: ValuationService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValuationService,
        {
          provide: PrismaService,
          useValue: {
            stockOnHand: {
              findMany: jest.fn(),
            },
            batch: {
              findMany: jest.fn(),
            },
            valuationSnapshot: {
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<ValuationService>(ValuationService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('calculateWeightedAverage', () => {
    it('should calculate WAVG valuation correctly', async () => {
      const stockOnHand = [
        {
          itemId: 'item-1',
          locationId: 'loc-1',
          restaurantId: 'rest-1',
          qtyOnHandBase: 100,
          avgCost: 2.5,
          totalValue: 250,
          item: { id: 'item-1', name: 'Item A', restaurantId: 'rest-1' },
          location: { id: 'loc-1', name: 'Location 1', restaurantId: 'rest-1' },
        },
        {
          itemId: 'item-2',
          locationId: 'loc-1',
          restaurantId: 'rest-1',
          qtyOnHandBase: 50,
          avgCost: 5.0,
          totalValue: 250,
          item: { id: 'item-2', name: 'Item B', restaurantId: 'rest-1' },
          location: { id: 'loc-1', name: 'Location 1', restaurantId: 'rest-1' },
        },
      ];

      jest.spyOn(prisma.stockOnHand, 'findMany').mockResolvedValue(stockOnHand as any);

      const result = await service['calculateWeightedAverage']('rest-1');

      expect(result.method).toBe(ValuationMethod.WAVG);
      expect(result.totalValue).toBe(500);
      expect(result.itemValuations).toHaveLength(2);
      expect(result.itemValuations[0].totalCost).toBe(250);
      expect(result.itemValuations[1].totalCost).toBe(250);
    });
  });

  describe('calculateFIFO', () => {
    it('should calculate FIFO valuation correctly', async () => {
      const batches = [
        {
          id: '1',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 30,
          lastUnitCost: 2.0,
          createdAt: new Date('2024-01-01'),
          item: { id: 'item-1', name: 'Item A', restaurantId: 'rest-1' },
          location: { id: 'loc-1', name: 'Location 1', restaurantId: 'rest-1' },
        },
        {
          id: '2',
          itemId: 'item-1',
          locationId: 'loc-1',
          qtyOnHandBase: 20,
          lastUnitCost: 2.5,
          createdAt: new Date('2024-01-02'),
          item: { id: 'item-1', name: 'Item A', restaurantId: 'rest-1' },
          location: { id: 'loc-1', name: 'Location 1', restaurantId: 'rest-1' },
        },
      ];

      jest.spyOn(prisma.batch, 'findMany').mockResolvedValue(batches as any);

      const result = await service['calculateFIFO']('rest-1');

      expect(result.method).toBe(ValuationMethod.FIFO);
      // Total: (30 * 2.0) + (20 * 2.5) = 60 + 50 = 110
      expect(result.totalValue).toBe(110);
      expect(result.itemValuations).toHaveLength(1);
      expect(result.itemValuations[0].qty).toBe(50);
      expect(result.itemValuations[0].totalCost).toBe(110);
      expect(result.itemValuations[0].unitCost).toBe(2.2); // 110 / 50
    });
  });

  describe('calculateWeightedAvgCost', () => {
    it('should calculate new weighted average on receipt', () => {
      // Current: 100 kg @ $2.50/kg = $250
      // New: 50 kg @ $3.00/kg = $150
      // Total: 150 kg @ $2.67/kg = $400

      const newAvgCost = service.calculateWeightedAvgCost(100, 2.5, 50, 3.0);

      expect(newAvgCost).toBeCloseTo(2.67, 2);
    });

    it('should handle first receipt (zero current quantity)', () => {
      const newAvgCost = service.calculateWeightedAvgCost(0, 0, 50, 3.0);

      expect(newAvgCost).toBe(3.0);
    });

    it('should handle same cost receipts', () => {
      const newAvgCost = service.calculateWeightedAvgCost(100, 2.5, 50, 2.5);

      expect(newAvgCost).toBe(2.5);
    });

    it('should handle zero total quantity', () => {
      const newAvgCost = service.calculateWeightedAvgCost(0, 0, 0, 0);

      expect(newAvgCost).toBe(0);
    });
  });

  describe('createSnapshot', () => {
    it('should create valuation snapshot', async () => {
      const stockOnHand = [
        {
          itemId: 'item-1',
          locationId: 'loc-1',
          restaurantId: 'rest-1',
          qtyOnHandBase: 100,
          avgCost: 2.5,
          totalValue: 250,
          item: { id: 'item-1', name: 'Item A', restaurantId: 'rest-1' },
          location: { id: 'loc-1', name: 'Location 1', restaurantId: 'rest-1' },
        },
      ];

      jest.spyOn(prisma.stockOnHand, 'findMany').mockResolvedValue(stockOnHand as any);

      const snapshot = {
        id: 'snapshot-1',
        restaurantId: 'rest-1',
        atDate: new Date(),
        method: ValuationMethod.WAVG,
        totalValue: 250,
        details: [],
        createdAt: new Date(),
      };

      jest.spyOn(prisma.valuationSnapshot, 'create').mockResolvedValue(snapshot);

      const result = await service.createSnapshot('rest-1', ValuationMethod.WAVG);

      expect(result.restaurantId).toBe('rest-1');
      expect(result.method).toBe(ValuationMethod.WAVG);
      expect(result.totalValue).toBe(250);
    });
  });
});

