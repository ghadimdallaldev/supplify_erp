import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MultiTenantOrdersService } from './multi-tenant-orders.service';
import { EventsService } from './events.service';

describe('MultiTenantOrdersService Integration', () => {
  let app: INestApplication;
  let service: MultiTenantOrdersService;
  let prismaService: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MultiTenantOrdersService,
        PrismaService,
        {
          provide: EventsService,
          useValue: {
            emitOrderPlaced: jest.fn(),
            emitOrderAcknowledged: jest.fn(),
            emitOrderPreparing: jest.fn(),
            emitOrderDispatched: jest.fn(),
            emitOrderCancelled: jest.fn(),
            emitOrderDeliveredEnhanced: jest.fn(),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    service = module.get<MultiTenantOrdersService>(MultiTenantOrdersService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prismaService.orderEvent.deleteMany();
    await prismaService.orderItem.deleteMany();
    await prismaService.order.deleteMany();
    await prismaService.idempotencyKey.deleteMany();
  });

  describe('Complete Order Flow', () => {
    it('should handle complete order lifecycle from placement to delivery', async () => {
      const clientId = 'integration-client';
      const restaurantId = 'integration-restaurant';
      const supplierId = 'integration-supplier';

      // 1. Place order
      const placeOrderDto = {
        clientId,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-1',
              qtyOrderedBase: 10,
              uomBase: 'kg',
              unitPrice: 5.0,
              supplierId,
            },
          ],
          deliveryAddress: '123 Integration St',
          notes: 'Integration test order',
          idempotencyKey: 'integration-key-1',
        },
      };

      const placeResult = await service.placeOrder(placeOrderDto);
      expect(placeResult.success).toBe(true);
      expect(placeResult.orders).toHaveLength(1);

      const orderId = placeResult.orders[0].id;

      // 2. Supplier acknowledge
      const acknowledgeDto = {
        clientId,
        orderId,
        idempotencyKey: 'integration-key-2',
      };

      const acknowledgeResult = await service.supplierAcknowledge(acknowledgeDto);
      expect(acknowledgeResult.status).toBe('ACKNOWLEDGED');

      // 3. Supplier set preparing
      const preparingDto = {
        clientId,
        orderId,
        note: 'Starting preparation',
        idempotencyKey: 'integration-key-3',
      };

      const preparingResult = await service.supplierSetPreparing(preparingDto);
      expect(preparingResult.status).toBe('PREPARING');

      // 4. Supplier dispatch
      const dispatchDto = {
        clientId,
        orderId,
        carrier: 'Test Courier',
        driverName: 'John Doe',
        driverPhone: '+1234567890',
        etaAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        idempotencyKey: 'integration-key-4',
      };

      const dispatchResult = await service.supplierDispatch(dispatchDto);
      expect(dispatchResult.status).toBe('DISPATCHED');

      // 5. Supplier mark delivered
      const deliveredDto = {
        clientId,
        orderId,
        proofUrl: 'https://example.com/proof.jpg',
        idempotencyKey: 'integration-key-5',
      };

      const deliveredResult = await service.supplierMarkDelivered(deliveredDto);
      expect(deliveredResult.status).toBe('DELIVERED');

      // 6. Verify order state
      const finalOrder = await service.getOrder(clientId, orderId);
      expect(finalOrder.status).toBe('DELIVERED');
      expect(finalOrder.items).toHaveLength(1);
      expect(finalOrder.events).toHaveLength(5); // PLACED, ACKNOWLEDGED, PREPARING, DISPATCHED, DELIVERED
    });

    it('should handle multi-supplier order splitting correctly', async () => {
      const clientId = 'multi-supplier-client';
      const restaurantId = 'multi-supplier-restaurant';

      const placeOrderDto = {
        clientId,
        restaurantId,
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
          deliveryAddress: '123 Multi Supplier St',
          notes: 'Multi supplier test order',
          idempotencyKey: 'multi-supplier-key-1',
        },
      };

      const result = await service.placeOrder(placeOrderDto);
      expect(result.success).toBe(true);
      expect(result.orders).toHaveLength(2);
      expect(result.totalOrders).toBe(2);

      // Verify both orders exist
      const orders = await service.getOrders(clientId);
      expect(orders).toHaveLength(2);

      const supplier1Order = orders.find(o => o.supplierId === 'supplier-1');
      const supplier2Order = orders.find(o => o.supplierId === 'supplier-2');

      expect(supplier1Order).toBeDefined();
      expect(supplier2Order).toBeDefined();
      expect(supplier1Order.items).toHaveLength(1);
      expect(supplier2Order.items).toHaveLength(1);
    });

    it('should enforce idempotency correctly', async () => {
      const clientId = 'idempotency-client';
      const restaurantId = 'idempotency-restaurant';

      const placeOrderDto = {
        clientId,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-1',
              qtyOrderedBase: 10,
              uomBase: 'kg',
              unitPrice: 5.0,
              supplierId: 'supplier-1',
            },
          ],
          deliveryAddress: '123 Idempotency St',
          notes: 'Idempotency test order',
          idempotencyKey: 'idempotency-key-1',
        },
      };

      // Place order first time
      const result1 = await service.placeOrder(placeOrderDto);
      expect(result1.success).toBe(true);

      // Place order second time with same idempotency key
      const result2 = await service.placeOrder(placeOrderDto);
      expect(result2).toEqual(result1);

      // Verify only one order was created
      const orders = await service.getOrders(clientId);
      expect(orders).toHaveLength(1);
    });

    it('should handle order cancellation correctly', async () => {
      const clientId = 'cancellation-client';
      const restaurantId = 'cancellation-restaurant';

      // Place order
      const placeOrderDto = {
        clientId,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-1',
              qtyOrderedBase: 10,
              uomBase: 'kg',
              unitPrice: 5.0,
              supplierId: 'supplier-1',
            },
          ],
          deliveryAddress: '123 Cancellation St',
          notes: 'Cancellation test order',
          idempotencyKey: 'cancellation-key-1',
        },
      };

      const placeResult = await service.placeOrder(placeOrderDto);
      const orderId = placeResult.orders[0].id;

      // Cancel order
      const cancelDto = {
        clientId,
        orderId,
        reason: 'Customer requested cancellation',
        idempotencyKey: 'cancellation-key-2',
      };

      const cancelResult = await service.cancelOrder(cancelDto);
      expect(cancelResult.status).toBe('CANCELLED');
      expect(cancelResult.cancelReason).toBe('Customer requested cancellation');

      // Verify order state
      const finalOrder = await service.getOrder(clientId, orderId);
      expect(finalOrder.status).toBe('CANCELLED');
      expect(finalOrder.events).toHaveLength(2); // PLACED, CANCELLED
    });

    it('should enforce state machine transitions correctly', async () => {
      const clientId = 'state-machine-client';
      const restaurantId = 'state-machine-restaurant';

      // Place order
      const placeOrderDto = {
        clientId,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-1',
              qtyOrderedBase: 10,
              uomBase: 'kg',
              unitPrice: 5.0,
              supplierId: 'supplier-1',
            },
          ],
          deliveryAddress: '123 State Machine St',
          notes: 'State machine test order',
          idempotencyKey: 'state-machine-key-1',
        },
      };

      const placeResult = await service.placeOrder(placeOrderDto);
      const orderId = placeResult.orders[0].id;

      // Try invalid transition: PLACED -> DELIVERED (should fail)
      const invalidDeliveredDto = {
        clientId,
        orderId,
        proofUrl: 'https://example.com/proof.jpg',
        idempotencyKey: 'state-machine-key-2',
      };

      await expect(service.supplierMarkDelivered(invalidDeliveredDto)).rejects.toThrow('Invalid transition from PLACED to DELIVERED');

      // Try valid transition: PLACED -> ACKNOWLEDGED (should succeed)
      const acknowledgeDto = {
        clientId,
        orderId,
        idempotencyKey: 'state-machine-key-3',
      };

      const acknowledgeResult = await service.supplierAcknowledge(acknowledgeDto);
      expect(acknowledgeResult.status).toBe('ACKNOWLEDGED');
    });
  });

  describe('Tenant Isolation', () => {
    it('should ensure tenant isolation in order operations', async () => {
      const clientId1 = 'tenant-1';
      const clientId2 = 'tenant-2';
      const restaurantId = 'shared-restaurant';

      // Place order for tenant 1
      const placeOrderDto1 = {
        clientId: clientId1,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-1',
              qtyOrderedBase: 10,
              uomBase: 'kg',
              unitPrice: 5.0,
              supplierId: 'supplier-1',
            },
          ],
          deliveryAddress: '123 Tenant 1 St',
          notes: 'Tenant 1 order',
          idempotencyKey: 'tenant-1-key-1',
        },
      };

      const result1 = await service.placeOrder(placeOrderDto1);
      const orderId1 = result1.orders[0].id;

      // Place order for tenant 2
      const placeOrderDto2 = {
        clientId: clientId2,
        restaurantId,
        input: {
          items: [
            {
              supplierProductId: 'prod-2',
              qtyOrderedBase: 5,
              uomBase: 'kg',
              unitPrice: 3.0,
              supplierId: 'supplier-2',
            },
          ],
          deliveryAddress: '123 Tenant 2 St',
          notes: 'Tenant 2 order',
          idempotencyKey: 'tenant-2-key-1',
        },
      };

      const result2 = await service.placeOrder(placeOrderDto2);
      const orderId2 = result2.orders[0].id;

      // Verify tenant 1 can only see their orders
      const tenant1Orders = await service.getOrders(clientId1);
      expect(tenant1Orders).toHaveLength(1);
      expect(tenant1Orders[0].id).toBe(orderId1);

      // Verify tenant 2 can only see their orders
      const tenant2Orders = await service.getOrders(clientId2);
      expect(tenant2Orders).toHaveLength(1);
      expect(tenant2Orders[0].id).toBe(orderId2);

      // Verify tenant 1 cannot access tenant 2's order
      await expect(service.getOrder(clientId1, orderId2)).rejects.toThrow('Order not found');

      // Verify tenant 2 cannot access tenant 1's order
      await expect(service.getOrder(clientId2, orderId1)).rejects.toThrow('Order not found');
    });
  });
});
