import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MultiTenantOrdersService } from './multi-tenant-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';

describe('MultiTenantOrdersService', () => {
  let service: MultiTenantOrdersService;
  let prismaService: PrismaService;
  let eventsService: EventsService;

  const mockPrismaService = {
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orderItem: {
      createMany: jest.fn(),
      updateMany: jest.fn(),
    },
    orderEvent: {
      create: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEventsService = {
    emitOrderPlaced: jest.fn(),
    emitOrderAcknowledged: jest.fn(),
    emitOrderPreparing: jest.fn(),
    emitOrderDispatched: jest.fn(),
    emitOrderCancelled: jest.fn(),
    emitOrderDelivered: jest.fn(),
    emitOrderDeliveredEnhanced: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiTenantOrdersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<MultiTenantOrdersService>(MultiTenantOrdersService);
    prismaService = module.get<PrismaService>(PrismaService);
    eventsService = module.get<EventsService>(EventsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('placeOrder', () => {
    const mockPlaceOrderDto = {
      clientId: 'test-client',
      restaurantId: 'test-restaurant',
      input: {
        items: [
          {
            supplierProductId: 'prod-1',
            qtyOrderedBase: 10,
            uomBase: 'kg',
            unitPrice: 5.0,
            supplierId: 'supplier-1',
          },
          {
            supplierProductId: 'prod-2',
            qtyOrderedBase: 5,
            uomBase: 'kg',
            unitPrice: 3.0,
            supplierId: 'supplier-2',
          },
        ],
        deliveryAddress: '123 Test St',
        notes: 'Test order',
        idempotencyKey: 'test-key-1',
      },
    };

    it('should successfully place order and split by supplier', async () => {
      // Mock idempotency check
      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(null);

      // Mock transaction
      const mockOrder1 = {
        id: 'order-1',
        clientId: 'test-client',
        restaurantId: 'test-restaurant',
        supplierId: 'supplier-1',
        status: 'PLACED',
        subtotal: 50,
        discount: 0,
        tax: 2.5,
        shipping: 10,
        totalNet: 62.5,
        currency: 'USD',
        deliveryAddress: '123 Test St',
        notes: 'Test order',
        placedAt: new Date(),
        items: [],
        events: [],
      };

      const mockOrder2 = {
        id: 'order-2',
        clientId: 'test-client',
        restaurantId: 'test-restaurant',
        supplierId: 'supplier-2',
        status: 'PLACED',
        subtotal: 15,
        discount: 0,
        tax: 0.75,
        shipping: 10,
        totalNet: 25.75,
        currency: 'USD',
        deliveryAddress: '123 Test St',
        notes: 'Test order',
        placedAt: new Date(),
        items: [],
        events: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          order: {
            create: jest.fn().mockResolvedValueOnce(mockOrder1).mockResolvedValueOnce(mockOrder2),
          },
          orderItem: {
            createMany: jest.fn().mockResolvedValue({}),
          },
          orderEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await service.placeOrder(mockPlaceOrderDto);

      expect(result.success).toBe(true);
      expect(result.orders).toHaveLength(2);
      expect(result.totalOrders).toBe(2);
      expect(mockEventsService.emitOrderPlaced).toHaveBeenCalledTimes(2);
    });

    it('should throw error for empty cart', async () => {
      const emptyCartDto = {
        ...mockPlaceOrderDto,
        input: {
          ...mockPlaceOrderDto.input,
          items: [],
        },
      };

      await expect(service.placeOrder(emptyCartDto)).rejects.toThrow(BadRequestException);
    });

    it('should return cached result for duplicate idempotency key', async () => {
      const cachedResult = {
        id: 'cached-key',
        clientId: 'test-client',
        key: 'test-key-1',
        resourceType: 'order',
        resourceId: 'order-1',
        payload: { success: true, orders: [{ id: 'order-1' }] },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(cachedResult);

      const result = await service.placeOrder(mockPlaceOrderDto);

      expect(result).toEqual(cachedResult.payload);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('supplierAcknowledge', () => {
    const mockAcknowledgeDto = {
      clientId: 'test-client',
      orderId: 'test-order',
      idempotencyKey: 'test-key-2',
    };

    it('should successfully acknowledge order', async () => {
      // Mock idempotency check
      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(null);

      // Mock order
      const mockOrder = {
        id: 'test-order',
        clientId: 'test-client',
        status: 'PLACED',
        restaurantId: 'test-restaurant',
        supplierId: 'test-supplier',
        ackBySlaAt: new Date(Date.now() + 30 * 60 * 1000),
        items: [],
        events: [],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          order: {
            findFirst: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: 'ACKNOWLEDGED' }),
          },
          orderEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await service.supplierAcknowledge(mockAcknowledgeDto);

      expect(result.status).toBe('ACKNOWLEDGED');
      expect(mockEventsService.emitOrderAcknowledged).toHaveBeenCalled();
    });

    it('should throw error for invalid state transition', async () => {
      // Mock idempotency check
      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(null);

      // Mock order with invalid status
      const mockOrder = {
        id: 'test-order',
        clientId: 'test-client',
        status: 'DELIVERED',
        restaurantId: 'test-restaurant',
        supplierId: 'test-supplier',
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          order: {
            findFirst: jest.fn().mockResolvedValue(mockOrder),
          },
        });
      });

      await expect(service.supplierAcknowledge(mockAcknowledgeDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw error for non-existent order', async () => {
      // Mock idempotency check
      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(null);

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          order: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        });
      });

      await expect(service.supplierAcknowledge(mockAcknowledgeDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('supplierMarkDelivered', () => {
    const mockDeliveredDto = {
      clientId: 'test-client',
      orderId: 'test-order',
      proofUrl: 'https://example.com/proof.jpg',
      idempotencyKey: 'test-key-3',
    };

    it('should successfully mark order as delivered and emit inventory events', async () => {
      // Mock idempotency check
      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(null);

      // Mock order with items
      const mockOrder = {
        id: 'test-order',
        clientId: 'test-client',
        status: 'DISPATCHED',
        restaurantId: 'test-restaurant',
        supplierId: 'test-supplier',
        totalNet: 100,
        items: [
          {
            id: 'item-1',
            supplierProductId: 'prod-1',
            restaurantItemId: 'rest-item-1',
            qtyDeliveredBase: 10,
            uomBase: 'kg',
          },
        ],
      };

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          order: {
            findFirst: jest.fn().mockResolvedValue(mockOrder),
            update: jest.fn().mockResolvedValue({ ...mockOrder, status: 'DELIVERED' }),
          },
          orderItem: {
            updateMany: jest.fn().mockResolvedValue({}),
          },
          orderEvent: {
            create: jest.fn().mockResolvedValue({}),
          },
        });
      });

      const result = await service.supplierMarkDelivered(mockDeliveredDto);

      expect(result.status).toBe('DELIVERED');
      expect(mockEventsService.emitOrderDelivered).toHaveBeenCalledWith({
        clientId: 'test-client',
        orderId: 'test-order',
        restaurantId: 'test-restaurant',
        supplierId: 'test-supplier',
        total: 100,
        items: mockOrder.items,
      });
    });
  });

  describe('getOrders', () => {
    it('should return orders for client with filter', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          clientId: 'test-client',
          status: 'PLACED',
          items: [],
          events: [],
        },
        {
          id: 'order-2',
          clientId: 'test-client',
          status: 'DELIVERED',
          items: [],
          events: [],
        },
      ];

      mockPrismaService.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getOrders('test-client', { status: 'PLACED' });

      expect(result).toEqual(mockOrders);
      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith({
        where: {
          clientId: 'test-client',
          status: 'PLACED',
        },
        include: {
          items: true,
          events: {
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getOrder', () => {
    it('should return order by ID', async () => {
      const mockOrder = {
        id: 'test-order',
        clientId: 'test-client',
        status: 'PLACED',
        items: [],
        events: [],
      };

      mockPrismaService.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.getOrder('test-client', 'test-order');

      expect(result).toEqual(mockOrder);
      expect(mockPrismaService.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'test-order', clientId: 'test-client' },
        include: {
          items: true,
          events: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    });

    it('should throw error for non-existent order', async () => {
      mockPrismaService.order.findFirst.mockResolvedValue(null);

      await expect(service.getOrder('test-client', 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('state machine validation', () => {
    it('should validate state transitions correctly', () => {
      // Test valid transitions
      expect(service['isValidTransition']('PLACED', 'ACKNOWLEDGED')).toBe(true);
      expect(service['isValidTransition']('ACKNOWLEDGED', 'PREPARING')).toBe(true);
      expect(service['isValidTransition']('PREPARING', 'DISPATCHED')).toBe(true);
      expect(service['isValidTransition']('DISPATCHED', 'DELIVERED')).toBe(true);

      // Test invalid transitions
      expect(service['isValidTransition']('DELIVERED', 'ACKNOWLEDGED')).toBe(false);
      expect(service['isValidTransition']('CANCELLED', 'PLACED')).toBe(false);
    });
  });
});
