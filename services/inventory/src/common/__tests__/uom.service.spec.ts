import { Test, TestingModule } from '@nestjs/testing';
import { UomService } from '../uom.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockUoms = [
  { id: '1', code: 'kg', name: 'Kilogram', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
  { id: '2', code: 'g', name: 'Gram', baseCode: 'kg', ratioToBase: 0.001, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', code: 'L', name: 'Liter', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
  { id: '4', code: 'ml', name: 'Milliliter', baseCode: 'L', ratioToBase: 0.001, createdAt: new Date(), updatedAt: new Date() },
  { id: '5', code: 'each', name: 'Each', baseCode: null, ratioToBase: 1.0, createdAt: new Date(), updatedAt: new Date() },
  { id: '6', code: 'pack', name: 'Pack', baseCode: 'each', ratioToBase: 6.0, createdAt: new Date(), updatedAt: new Date() },
  { id: '7', code: 'case', name: 'Case', baseCode: 'each', ratioToBase: 24.0, createdAt: new Date(), updatedAt: new Date() },
];

describe('UomService', () => {
  let service: UomService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const findMany = jest.fn().mockResolvedValue(mockUoms);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UomService,
        {
          provide: PrismaService,
          useValue: {
            uom: { findMany },
          },
        },
      ],
    }).compile();

    service = module.get<UomService>(UomService);
    prisma = module.get<PrismaService>(PrismaService);
    await service.refreshCache();
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

    it('should return same quantity for identical UOM', () => {
      expect(service.convert(10, 'kg', 'kg')).toBe(10);
    });

    it('should throw for incompatible UOM families', () => {
      expect(() => service.convert(1, 'kg', 'L')).toThrow('incompatible UOM families');
    });

    it('should throw for unknown UOM codes', () => {
      expect(() => service.convert(1, 'unknown', 'kg')).toThrow('UOM not found');
    });
  });

  describe('toBase', () => {
    it('should convert display UOM to base', () => {
      expect(service.toBase(1000, 'g')).toBe(1);
    });
  });

  describe('fromBase', () => {
    it('should convert base quantity to display UOM', () => {
      expect(service.fromBase(1, 'kg', 'g')).toBe(1000);
    });
  });

  describe('getBaseUom', () => {
    it('should return base code for derived UOM', () => {
      expect(service.getBaseUom('g')).toBe('kg');
    });

    it('should return same code for base UOM', () => {
      expect(service.getBaseUom('kg')).toBe('kg');
    });
  });

  describe('refreshCache', () => {
    it('reloads UOM data from prisma', async () => {
      jest.spyOn(prisma.uom, 'findMany').mockResolvedValueOnce([
        ...mockUoms,
        { id: '8', code: 'box', name: 'Box', baseCode: 'each', ratioToBase: 12.0, createdAt: new Date(), updatedAt: new Date() },
      ]);

      await service.refreshCache();
      expect(service.convert(1, 'box', 'each')).toBe(12);
    });
  });
});
