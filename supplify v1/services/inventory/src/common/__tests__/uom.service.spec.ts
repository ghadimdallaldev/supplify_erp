import { Test, TestingModule } from '@nestjs/testing';
import { UomService } from '../uom.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UomService', () => {
  let service: UomService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UomService,
        {
          provide: PrismaService,
          useValue: {
            uom: {
              findMany: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<UomService>(UomService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // Mock UOM data
    jest.spyOn(prisma.uom, 'findMany').mockResolvedValue([
      { id: '1', code: 'kg', name: 'Kilogram', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
      { id: '2', code: 'g', name: 'Gram', baseCode: 'kg', ratioToBase: 0.001, createdAt: new Date(), updatedAt: new Date() },
      { id: '3', code: 'L', name: 'Liter', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
      { id: '4', code: 'ml', name: 'Milliliter', baseCode: 'L', ratioToBase: 0.001, createdAt: new Date(), updatedAt: new Date() },
      { id: '5', code: 'each', name: 'Each', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
      { id: '6', code: 'pack', name: 'Pack', baseCode: 'each', ratioToBase: 6.0, createdAt: new Date(), updatedAt: new Date() },
      { id: '7', code: 'case', name: 'Case', baseCode: 'each', ratioToBase: 24.0, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await service['loadUomCache']();
  });

  describe('convert', () => {
    it('should convert kg to g correctly', () => {
      const result = service.convert(5, 'kg', 'g');
      expect(result).toBe(5000);
    });

    it('should convert g to kg correctly', () => {
      const result = service.convert(2500, 'g', 'kg');
      expect(result).toBe(2.5);
    });

    it('should convert L to ml correctly', () => {
      const result = service.convert(3, 'L', 'ml');
      expect(result).toBe(3000);
    });

    it('should convert ml to L correctly', () => {
      const result = service.convert(1500, 'ml', 'L');
      expect(result).toBe(1.5);
    });

    it('should convert case to each correctly', () => {
      const result = service.convert(2, 'case', 'each');
      expect(result).toBe(48); // 2 cases * 24 each/case
    });

    it('should convert pack to each correctly', () => {
      const result = service.convert(5, 'pack', 'each');
      expect(result).toBe(30); // 5 packs * 6 each/pack
    });

    it('should return same value when converting to same UOM', () => {
      const result = service.convert(100, 'kg', 'kg');
      expect(result).toBe(100);
    });

    it('should throw error for incompatible UOM families', () => {
      expect(() => {
        service.convert(10, 'kg', 'L');
      }).toThrow('Cannot convert between incompatible UOM families');
    });

    it('should throw error for unknown UOM', () => {
      expect(() => {
        service.convert(10, 'kg', 'unknown');
      }).toThrow('UOM not found');
    });
  });

  describe('toBase', () => {
    it('should convert to base UOM correctly', () => {
      expect(service.toBase(2500, 'g')).toBe(2.5); // -> kg
      expect(service.toBase(500, 'ml')).toBe(0.5); // -> L
      expect(service.toBase(3, 'case')).toBe(72); // -> each
    });

    it('should return same value if already in base', () => {
      expect(service.toBase(10, 'kg')).toBe(10);
      expect(service.toBase(5, 'L')).toBe(5);
    });
  });

  describe('fromBase', () => {
    it('should convert from base to display UOM correctly', () => {
      expect(service.fromBase(2.5, 'kg', 'g')).toBe(2500);
      expect(service.fromBase(0.5, 'L', 'ml')).toBe(500);
    });
  });

  describe('getBaseUom', () => {
    it('should return base UOM code', () => {
      expect(service.getBaseUom('g')).toBe('kg');
      expect(service.getBaseUom('ml')).toBe('L');
      expect(service.getBaseUom('kg')).toBe('kg');
    });
  });
});

