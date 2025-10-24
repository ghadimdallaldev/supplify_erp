import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * UOM Conversion Service
 * Handles conversions between units of measure
 */
@Injectable()
export class UomService {
  // Cache for UOM ratios
  private uomCache = new Map<string, { baseCode: string | null; ratioToBase: number }>();

  constructor(private prisma: PrismaService) {
    this.loadUomCache();
  }

  private async loadUomCache() {
    const uoms = await this.prisma.uom.findMany();
    for (const uom of uoms) {
      this.uomCache.set(uom.code, {
        baseCode: uom.baseCode,
        ratioToBase: uom.ratioToBase,
      });
    }
  }

  /**
   * Convert quantity from one UOM to another
   */
  convert(qty: number, fromUom: string, toUom: string): number {
    if (fromUom === toUom) return qty;

    const fromData = this.uomCache.get(fromUom);
    const toData = this.uomCache.get(toUom);

    if (!fromData || !toData) {
      throw new Error(`UOM not found: ${fromUom} or ${toUom}`);
    }

    // Both must share the same base unit family
    const fromBase = fromData.baseCode || fromUom;
    const toBase = toData.baseCode || toUom;

    if (fromBase !== toBase) {
      throw new Error(`Cannot convert between incompatible UOM families: ${fromUom} -> ${toUom}`);
    }

    // Convert to base, then to target
    const qtyInBase = qty * fromData.ratioToBase;
    return qtyInBase / toData.ratioToBase;
  }

  /**
   * Convert to base UOM
   */
  toBase(qty: number, fromUom: string): number {
    const uomData = this.uomCache.get(fromUom);
    if (!uomData) {
      throw new Error(`UOM not found: ${fromUom}`);
    }
    return qty * uomData.ratioToBase;
  }

  /**
   * Convert from base UOM to display UOM
   */
  fromBase(qtyBase: number, baseUom: string, toUom: string): number {
    return this.convert(qtyBase, baseUom, toUom);
  }

  /**
   * Get base unit code for a UOM
   */
  getBaseUom(uomCode: string): string {
    const uomData = this.uomCache.get(uomCode);
    if (!uomData) {
      throw new Error(`UOM not found: ${uomCode}`);
    }
    return uomData.baseCode || uomCode;
  }

  /**
   * Refresh cache (call after adding new UOMs)
   */
  async refreshCache() {
    this.uomCache.clear();
    await this.loadUomCache();
  }
}

