import type { Address } from './common';

export interface Supplier {
  id: string;
  orgName: string;
  taxId: string;
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  billingPlan: 'FREE' | 'BASIC' | 'PREMIUM';
  promoCredits: number;
  addresses: Address[];
  logoKey?: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Promotion {
  id: string;
  supplierId: string;
  type: 'FEATURED' | 'DISCOUNT';
  name: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  budget: number;
  spent: number;
  cpm?: number;
  cpc?: number;
  tags: string[];
  priority: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

