import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isFlagOn } from '@supplify/flags-server';
import slugify from 'slugify';

export interface QuickProductInput {
  supplierId: string;
  sku: string;
  name: string;
  brand?: string;
  categoryId: string;
  unit: string;
  packSize?: string;
  price: number;
  currency?: string;
  minOrderQty?: number;
  leadTimeDays?: number;
  stockQty?: number;
  description?: string;
  imageKeys?: string[];
}

/**
 * Quick Add Product Service
 * Fast single product creation with validation
 */
@Injectable()
export class QuickAddService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a product via Quick Add
   */
  async createProduct(input: QuickProductInput) {
    // Check feature flag
    const flagResult = await isFlagOn('catalog', {
      env: (process.env.NODE_ENV as any) || 'development',
      orgType: 'SUPPLIER',
      orgId: input.supplierId,
    });

    if (!flagResult.on) {
      throw new BadRequestException('Catalog feature is disabled');
    }

    // Check tier limit (TODO: integrate with subscriptions service)
    const currentCount = await this.prisma.product.count({
      where: {
        supplierId: input.supplierId,
        active: true,
      },
    });

    // For now, use a simple limit (should be from entitlements)
    const maxProducts = 5000; // Would come from entitlements
    
    if (currentCount >= maxProducts) {
      throw new BadRequestException({
        error: 'LIMIT_EXCEEDED',
        limit: 'products',
        current: currentCount,
        cap: maxProducts,
        suggestedTier: 'PRO',
      });
    }

    // Validate SKU uniqueness
    const existing = await this.prisma.product.findFirst({
      where: {
        supplierId: input.supplierId,
        sku: input.sku,
      },
    });

    if (existing) {
      throw new BadRequestException(`Product with SKU "${input.sku}" already exists`);
    }

    // Validate category exists
    const category = await this.prisma.category.findUnique({
      where: { id: input.categoryId },
    });

    if (!category) {
      throw new BadRequestException('Category not found');
    }

    // Generate slug
    const baseSlug = slugify(input.name, { lower: true, strict: true });
    let slug = baseSlug;
    let counter = 1;

    while (await this.prisma.product.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create product
    const product = await this.prisma.product.create({
      data: {
        supplierId: input.supplierId,
        sku: input.sku,
        name: input.name,
        slug,
        brand: input.brand,
        categoryId: input.categoryId,
        unit: input.unit.toUpperCase(),
        packSize: input.packSize,
        price: input.price,
        currency: input.currency || 'USD',
        minOrderQty: input.minOrderQty || 1,
        leadTimeDays: input.leadTimeDays || 2,
        stockQty: input.stockQty || 0,
        imageKeys: input.imageKeys || [],
        attributes: input.description ? { description: input.description } : {},
        active: true,
      },
      include: {
        category: true,
      },
    });

    return product;
  }

  /**
   * Validate product input
   */
  validateProductInput(input: QuickProductInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.sku || input.sku.trim().length === 0) {
      errors.push('SKU is required');
    }

    if (!input.name || input.name.trim().length === 0) {
      errors.push('Product name is required');
    }

    if (!input.categoryId) {
      errors.push('Category is required');
    }

    if (!input.unit || !this.isValidUnit(input.unit)) {
      errors.push('Valid unit is required (EACH, KG, G, L, ML, CASE, PACK)');
    }

    if (input.price === undefined || input.price <= 0) {
      errors.push('Price must be greater than 0');
    }

    if (input.minOrderQty !== undefined && input.minOrderQty < 1) {
      errors.push('Min order quantity must be at least 1');
    }

    if (input.leadTimeDays !== undefined && input.leadTimeDays < 0) {
      errors.push('Lead time cannot be negative');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if unit is valid
   */
  private isValidUnit(unit: string): boolean {
    const validUnits = ['EACH', 'KG', 'G', 'LB', 'OZ', 'L', 'ML', 'GAL', 'CASE', 'PACK', 'DOZEN'];
    return validUnits.includes(unit.toUpperCase());
  }
}

