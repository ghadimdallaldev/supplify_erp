import { Test, TestingModule } from '@nestjs/testing';
import { PinsService } from '../pins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('PinsService', () => {
  let service: PinsService;
  let prisma: PrismaService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PinsService,
        {
          provide: PrismaService,
          useValue: {
            pinnedProduct: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
              updateMany: jest.fn(),
              count: jest.fn(),
              aggregate: jest.fn(),
            },
            $transaction: jest.fn(async (arg) => {
              if (typeof arg === 'function') {
                return arg(prisma);
              }
              return Promise.all(arg);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PinsService>(PinsService);
    prisma = module.get<PrismaService>(PrismaService);

    // Mock Redis
    service['redis'] = mockRedis as any;
  });

  describe('pinProduct', () => {
    it('should pin a new product with correct sortIndex', async () => {
      const restaurantId = 'rest-1';
      const supplierId = 'sup-1';
      const productId = 'prod-1';

      jest.spyOn(prisma.pinnedProduct, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.pinnedProduct, 'count').mockResolvedValue(3);
      jest.spyOn(prisma.pinnedProduct, 'aggregate').mockResolvedValue({
        _max: { sortIndex: 2 },
      } as any);

      const mockPin = {
        id: 'pin-1',
        restaurantId,
        supplierId,
        productId,
        sortIndex: 3, // Next index
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.pinnedProduct, 'create').mockResolvedValue(mockPin);

      const result = await service.pinProduct(restaurantId, supplierId, productId);

      expect(result.sortIndex).toBe(3);
      expect(prisma.pinnedProduct.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sortIndex: 3,
        }),
      });
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should return existing pin if already pinned', async () => {
      const existingPin = {
        id: 'pin-1',
        restaurantId: 'rest-1',
        supplierId: 'sup-1',
        productId: 'prod-1',
        sortIndex: 0,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.pinnedProduct, 'findUnique').mockResolvedValue(existingPin);

      const result = await service.pinProduct('rest-1', 'sup-1', 'prod-1');

      expect(result).toEqual(existingPin);
      expect(prisma.pinnedProduct.create).not.toHaveBeenCalled();
    });

    it('should update note if already pinned and note provided', async () => {
      const existingPin = {
        id: 'pin-1',
        restaurantId: 'rest-1',
        supplierId: 'sup-1',
        productId: 'prod-1',
        sortIndex: 0,
        note: 'old note',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(prisma.pinnedProduct, 'findUnique').mockResolvedValue(existingPin);
      jest.spyOn(prisma.pinnedProduct, 'update').mockResolvedValue({
        ...existingPin,
        note: 'new note',
      });

      const result = await service.pinProduct('rest-1', 'sup-1', 'prod-1', 'new note');

      expect(result.note).toBe('new note');
      expect(prisma.pinnedProduct.update).toHaveBeenCalled();
    });

    it('should throw error when max pins reached', async () => {
      jest.spyOn(prisma.pinnedProduct, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.pinnedProduct, 'count').mockResolvedValue(200); // Max limit

      await expect(
        service.pinProduct('rest-1', 'sup-1', 'prod-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('unpinProduct', () => {
    it('should unpin a product and invalidate cache', async () => {
      jest.spyOn(prisma.pinnedProduct, 'deleteMany').mockResolvedValue({ count: 1 });

      const result = await service.unpinProduct('rest-1', 'sup-1', 'prod-1');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should return false if product was not pinned', async () => {
      jest.spyOn(prisma.pinnedProduct, 'deleteMany').mockResolvedValue({ count: 0 });

      const result = await service.unpinProduct('rest-1', 'sup-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  describe('reorderPinnedProducts', () => {
    it('should update sortIndex for all pins in order', async () => {
      const pins = [
        { id: '1', productId: 'prod-1', sortIndex: 0 },
        { id: '2', productId: 'prod-2', sortIndex: 1 },
        { id: '3', productId: 'prod-3', sortIndex: 2 },
      ];

      jest.spyOn(prisma.pinnedProduct, 'findMany').mockResolvedValue(pins as any);

      const newOrder = ['prod-3', 'prod-1', 'prod-2'];

      await service.reorderPinnedProducts('rest-1', 'sup-1', newOrder);

      // Verify transaction was called with updateMany operations
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should throw error if some products are not pinned', async () => {
      jest.spyOn(prisma.pinnedProduct, 'findMany').mockResolvedValue([
        { id: '1', productId: 'prod-1' } as any,
      ]);

      await expect(
        service.reorderPinnedProducts('rest-1', 'sup-1', ['prod-1', 'prod-2', 'prod-3']),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getPinnedProducts with caching', () => {
    it('should return cached pins if available', async () => {
      const cachedData = [
        { productId: 'prod-1', sortIndex: 0, note: null },
        { productId: 'prod-2', sortIndex: 1, note: 'test' },
      ];

      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));

      const fullPins = [
        {
          id: '1',
          restaurantId: 'rest-1',
          supplierId: 'sup-1',
          productId: 'prod-1',
          sortIndex: 0,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          restaurantId: 'rest-1',
          supplierId: 'sup-1',
          productId: 'prod-2',
          sortIndex: 1,
          note: 'test',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.pinnedProduct, 'findMany').mockResolvedValue(fullPins);

      const result = await service.getPinnedProducts('rest-1', 'sup-1');

      expect(mockRedis.get).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should fetch from DB and populate cache on miss', async () => {
      mockRedis.get.mockResolvedValue(null); // Cache miss

      const pins = [
        {
          id: '1',
          restaurantId: 'rest-1',
          supplierId: 'sup-1',
          productId: 'prod-1',
          sortIndex: 0,
          note: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(prisma.pinnedProduct, 'findMany').mockResolvedValue(pins);

      const result = await service.getPinnedProducts('rest-1', 'sup-1');

      expect(result).toEqual(pins);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        86400,
        expect.any(String),
      );
    });
  });
});

