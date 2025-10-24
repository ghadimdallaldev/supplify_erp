import type { Currency, Unit } from '@supplify/config';

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  slug: string;
  categoryId: string;
  unit: Unit;
  packSize?: string;
  leadTimeDays: number;
  currency: Currency;
  price: number;
  compareAtPrice?: number;
  stockQty: number;
  minOrderQty: number;
  imageKeys: string[];
  attributes: Record<string, unknown>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  parentId?: string;
  name: string;
  slug: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSearchInput {
  query?: string;
  categoryId?: string;
  supplierId?: string;
  minPrice?: number;
  maxPrice?: number;
  unit?: Unit;
  inStock?: boolean;
  page?: number;
  limit?: number;
}

