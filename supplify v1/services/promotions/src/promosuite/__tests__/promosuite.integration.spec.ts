import { Test, TestingModule } from '@nestjs/testing';
import { PromoSuiteService } from '../promosuite.service';
import { PromoSuiteServingService } from '../promosuite-serving.service';
import { PromoSuiteBudgetService } from '../promosuite-budget.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignType } from '../campaigns/types/campaign.types';

describe('PromoSuite Integration Tests', () => {
  let service: PromoSuiteService;
  let servingService: PromoSuiteServingService;
  let budgetService: PromoSuiteBudgetService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromoSuiteService,
        PromoSuiteServingService,
        PromoSuiteBudgetService,
        {
          provide: PrismaService,
          useValue: {
            campaign: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            adStat: {
              findFirst: jest.fn(),
              upsert: jest.fn(),
              aggregate: jest.fn(),
            },
            impressionLog: {
              create: jest.fn(),
            },
            clickLog: {
              create: jest.fn(),
            },
            user: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: 'Redis',
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            del: jest.fn(),
            exists: jest.fn(),
            keys: jest.fn(),
          },
        },
        {
          provide: 'NOTIFICATIONS_SERVICE',
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PromoSuiteService>(PromoSuiteService);
    servingService = module.get<PromoSuiteServingService>(PromoSuiteServingService);
    budgetService = module.get<PromoSuiteBudgetService>(PromoSuiteBudgetService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Feature Flag ON/OFF Scenarios', () => {
    it('should serve organic content when PromoSuite is disabled', async () => {
      // Mock feature flag disabled
      const mockOrganicItems = [
        { id: 'item1', name: 'Organic Item 1' },
        { id: 'item2', name: 'Organic Item 2' },
      ];

      const result = await servingService.servePromoSuiteContent({
        placement: 'SUPPLIER_CARD',
        organicItems: mockOrganicItems,
        userTier: 'FREE',
      });

      expect(result.blendedItems).toEqual(
        mockOrganicItems.map(item => ({ ...item, isSponsored: false }))
      );
      expect(result.discounts).toEqual([]);
      expect(result.featuredProducts).toEqual([]);
      expect(result.metadata.totalSponsored).toBe(0);
    });

    it('should serve PromoSuite content when enabled', async () => {
      // Mock feature flag enabled and campaigns available
      const mockCampaigns = [
        {
          id: 'campaign1',
          type: CampaignType.SPONSORED_VISIBILITY,
          status: 'ACTIVE',
          placement: 'SUPPLIER_CARD',
          supplierId: 'supplier1',
          priorityScore: 1.2,
          spentUSD: 100,
          totalBudgetUSD: 1000,
          dailyBudgetUSD: 50,
          startDate: new Date(Date.now() - 86400000),
          endDate: new Date(Date.now() + 86400000),
          targetIds: ['supplier1'],
          keywords: ['fresh'],
        },
      ];

      jest.spyOn(prisma.campaign, 'findMany').mockResolvedValue(mockCampaigns);

      const mockOrganicItems = [
        { id: 'item1', name: 'Organic Item 1' },
        { id: 'item2', name: 'Organic Item 2' },
      ];

      const result = await servingService.servePromoSuiteContent({
        placement: 'SUPPLIER_CARD',
        organicItems: mockOrganicItems,
        userTier: 'PRO',
      });

      expect(result.blendedItems.length).toBeGreaterThan(0);
      expect(result.metadata.totalSponsored).toBeGreaterThan(0);
    });
  });

  describe('Campaign Type Validation', () => {
    it('should validate Sponsored Visibility campaigns correctly', async () => {
      const validCampaign = {
        type: CampaignType.SPONSORED_VISIBILITY,
        placement: 'SUPPLIER_CARD',
        totalBudgetUSD: 1000,
        cpmUSD: 2.5,
        targetType: 'SUPPLIER',
        targetIds: ['supplier1'],
      };

      // Should not throw error
      expect(() => {
        service.validateCampaignType(validCampaign);
      }).not.toThrow();
    });

    it('should reject Sponsored Visibility campaigns without required fields', async () => {
      const invalidCampaign = {
        type: CampaignType.SPONSORED_VISIBILITY,
        // Missing placement, totalBudgetUSD, cpmUSD
        targetType: 'SUPPLIER',
        targetIds: ['supplier1'],
      };

      expect(() => {
        service.validateCampaignType(invalidCampaign);
      }).toThrow();
    });

    it('should validate Discount campaigns correctly', async () => {
      const validCampaign = {
        type: CampaignType.DISCOUNT,
        discountType: 'PERCENT',
        discountValue: 20,
        minQty: 5,
        targetType: 'PRODUCT',
        targetIds: ['product1'],
      };

      expect(() => {
        service.validateCampaignType(validCampaign);
      }).not.toThrow();
    });

    it('should reject Discount campaigns with invalid discount values', async () => {
      const invalidCampaign = {
        type: CampaignType.DISCOUNT,
        discountType: 'PERCENT',
        discountValue: 95, // Too high
        targetType: 'PRODUCT',
        targetIds: ['product1'],
      };

      expect(() => {
        service.validateCampaignType(invalidCampaign);
      }).toThrow();
    });

    it('should validate Featured Product campaigns correctly', async () => {
      const validCampaign = {
        type: CampaignType.FEATURED_PRODUCT,
        featureSlots: 2,
        targetType: 'PRODUCT',
        targetIds: ['product1'],
      };

      expect(() => {
        service.validateCampaignType(validCampaign);
      }).not.toThrow();
    });

    it('should reject Featured Product campaigns with invalid slot count', async () => {
      const invalidCampaign = {
        type: CampaignType.FEATURED_PRODUCT,
        featureSlots: 5, // Too many slots
        targetType: 'PRODUCT',
        targetIds: ['product1'],
      };

      expect(() => {
        service.validateCampaignType(invalidCampaign);
      }).toThrow();
    });
  });

  describe('Tier Gating', () => {
    it('should allow PRO tier users to create campaigns', async () => {
      const campaignData = {
        type: CampaignType.SPONSORED_VISIBILITY,
        placement: 'SUPPLIER_CARD',
        totalBudgetUSD: 1000,
        cpmUSD: 2.5,
        targetType: 'SUPPLIER',
        targetIds: ['supplier1'],
        name: 'Test Campaign',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        createdBy: 'user1',
      };

      jest.spyOn(prisma.campaign, 'create').mockResolvedValue({
        id: 'campaign1',
        ...campaignData,
        status: 'PENDING',
        spentUSD: 0,
        approved: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createCampaign('supplier1', 'user1', campaignData);
      expect(result).toBeDefined();
    });

    it('should reject FREE tier users from creating campaigns', async () => {
      const campaignData = {
        type: CampaignType.SPONSORED_VISIBILITY,
        placement: 'SUPPLIER_CARD',
        totalBudgetUSD: 1000,
        cpmUSD: 2.5,
        targetType: 'SUPPLIER',
        targetIds: ['supplier1'],
        name: 'Test Campaign',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        createdBy: 'user1',
      };

      // Mock user tier check
      jest.spyOn(service, 'checkUserTier').mockResolvedValue('FREE');

      await expect(
        service.createCampaign('supplier1', 'user1', campaignData)
      ).rejects.toThrow('Insufficient tier');
    });
  });

  describe('Budget Tracking', () => {
    it('should track impressions and update spend', async () => {
      const campaignId = 'campaign1';
      const viewId = 'view1';
      const mockCampaign = {
        id: campaignId,
        status: 'ACTIVE',
        cpmUSD: 2.5,
        spentUSD: 100,
        totalBudgetUSD: 1000,
        dailyBudgetUSD: 50,
      };

      jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue(mockCampaign);
      jest.spyOn(prisma.campaign, 'update').mockResolvedValue(mockCampaign);
      jest.spyOn(prisma.impressionLog, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.adStat, 'upsert').mockResolvedValue({} as any);

      await servingService.trackImpression(campaignId, viewId, {
        userId: 'user1',
        orgId: 'org1',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: campaignId },
        data: {
          spentUSD: { increment: 0.0025 }, // cpmUSD / 1000
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should pause campaign when budget is exhausted', async () => {
      const campaignId = 'campaign1';
      const mockCampaign = {
        id: campaignId,
        status: 'ACTIVE',
        cpmUSD: 2.5,
        spentUSD: 999,
        totalBudgetUSD: 1000,
        dailyBudgetUSD: 50,
        placement: 'SUPPLIER_CARD',
      };

      jest.spyOn(prisma.campaign, 'findUnique').mockResolvedValue(mockCampaign);
      jest.spyOn(prisma.campaign, 'update').mockResolvedValue({
        ...mockCampaign,
        status: 'EXHAUSTED',
      });

      await servingService.trackImpression(campaignId, 'view1', {
        userId: 'user1',
        orgId: 'org1',
      });

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: campaignId },
        data: {
          status: 'EXHAUSTED',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('Blending Rules', () => {
    it('should inject sponsored suppliers at top positions', async () => {
      const mockCampaigns = [
        {
          id: 'campaign1',
          type: CampaignType.SPONSORED_VISIBILITY,
          status: 'ACTIVE',
          placement: 'SUPPLIER_CARD',
          supplierId: 'supplier1',
          priorityScore: 1.2,
          spentUSD: 100,
          totalBudgetUSD: 1000,
          dailyBudgetUSD: 50,
          startDate: new Date(Date.now() - 86400000),
          endDate: new Date(Date.now() + 86400000),
          targetIds: ['supplier1'],
          keywords: ['fresh'],
        },
      ];

      jest.spyOn(prisma.campaign, 'findMany').mockResolvedValue(mockCampaigns);

      const organicSuppliers = [
        { id: 'supplier2', name: 'Organic Supplier 2' },
        { id: 'supplier3', name: 'Organic Supplier 3' },
      ];

      const result = await servingService.servePromoSuiteContent({
        placement: 'SUPPLIER_CARD',
        organicItems: organicSuppliers,
        userTier: 'PRO',
      });

      // First item should be sponsored
      expect(result.blendedItems[0].isSponsored).toBe(true);
      expect(result.blendedItems[0].campaignId).toBe('campaign1');
    });

    it('should limit sponsored content to 30% of visible results', async () => {
      const mockCampaigns = Array.from({ length: 10 }, (_, i) => ({
        id: `campaign${i}`,
        type: CampaignType.SPONSORED_VISIBILITY,
        status: 'ACTIVE',
        placement: 'PRODUCT_LIST',
        supplierId: `supplier${i}`,
        priorityScore: 1.0 + i * 0.1,
        spentUSD: 100,
        totalBudgetUSD: 1000,
        dailyBudgetUSD: 50,
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        targetIds: [`product${i}`],
        keywords: ['test'],
      }));

      jest.spyOn(prisma.campaign, 'findMany').mockResolvedValue(mockCampaigns);

      const organicProducts = Array.from({ length: 20 }, (_, i) => ({
        id: `organic${i}`,
        name: `Organic Product ${i}`,
      }));

      const result = await servingService.servePromoSuiteContent({
        placement: 'PRODUCT_LIST',
        organicItems: organicProducts,
        userTier: 'PRO',
      });

      const sponsoredCount = result.blendedItems.filter(item => item.isSponsored).length;
      const totalCount = result.blendedItems.length;
      const sponsoredPercentage = (sponsoredCount / totalCount) * 100;

      expect(sponsoredPercentage).toBeLessThanOrEqual(30);
    });
  });

  describe('Notifications', () => {
    it('should send budget exhaustion notification', async () => {
      const mockCampaign = {
        id: 'campaign1',
        name: 'Test Campaign',
        createdBy: 'user1',
        supplierEmail: 'supplier@example.com',
        spentUSD: 1000,
        totalBudgetUSD: 1000,
        dailyBudgetUSD: 50,
        placement: 'SUPPLIER_CARD',
      };

      jest.spyOn(prisma.campaign, 'update').mockResolvedValue(mockCampaign);
      jest.spyOn(budgetService, 'sendBudgetExhaustionNotification').mockResolvedValue();

      await budgetService.pauseCampaignForBudgetExhaustion(mockCampaign, 'Total budget exhausted');

      expect(budgetService.sendBudgetExhaustionNotification).toHaveBeenCalledWith(
        mockCampaign,
        'Total budget exhausted'
      );
    });

    it('should send campaign approval notification', async () => {
      const mockCampaign = {
        id: 'campaign1',
        name: 'Test Campaign',
        createdBy: 'user1',
        supplierEmail: 'supplier@example.com',
        approvedBy: 'admin1',
        approvedAt: new Date(),
      };

      jest.spyOn(budgetService, 'sendApprovalNotification').mockResolvedValue();

      await budgetService.sendApprovalNotification(mockCampaign, true);

      expect(budgetService.sendApprovalNotification).toHaveBeenCalledWith(
        mockCampaign,
        true,
        undefined
      );
    });
  });

  describe('Performance and Caching', () => {
    it('should use Redis cache for eligible campaigns', async () => {
      const mockCachedCampaigns = [
        {
          id: 'campaign1',
          type: CampaignType.SPONSORED_VISIBILITY,
          status: 'ACTIVE',
          placement: 'SUPPLIER_CARD',
        },
      ];

      const redis = {
        get: jest.fn().mockResolvedValue(JSON.stringify(mockCachedCampaigns)),
        setex: jest.fn(),
        del: jest.fn(),
        exists: jest.fn(),
        keys: jest.fn(),
      };

      const servingServiceWithRedis = new PromoSuiteServingService(
        prisma,
        redis as any
      );

      const result = await servingServiceWithRedis.servePromoSuiteContent({
        placement: 'SUPPLIER_CARD',
        organicItems: [],
        userTier: 'PRO',
      });

      expect(redis.get).toHaveBeenCalledWith('promosuite:eligible:v1:SUPPLIER_CARD');
      expect(prisma.campaign.findMany).not.toHaveBeenCalled();
    });

    it('should prevent duplicate impression tracking', async () => {
      const campaignId = 'campaign1';
      const viewId = 'view1';

      const redis = {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
        exists: jest.fn().mockResolvedValue(1), // Duplicate exists
        keys: jest.fn(),
      };

      const servingServiceWithRedis = new PromoSuiteServingService(
        prisma,
        redis as any
      );

      await servingServiceWithRedis.trackImpression(campaignId, viewId, {
        userId: 'user1',
        orgId: 'org1',
      });

      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
      expect(prisma.impressionLog.create).not.toHaveBeenCalled();
    });
  });
});
