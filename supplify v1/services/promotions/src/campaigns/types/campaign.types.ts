export type CampaignStatus = 
  | 'DRAFT' 
  | 'PENDING' 
  | 'ACTIVE' 
  | 'PAUSED' 
  | 'ENDED' 
  | 'REJECTED' 
  | 'EXHAUSTED';

export type CampaignType = 
  | 'SPONSORED_VISIBILITY' 
  | 'DISCOUNT' 
  | 'FEATURED_PRODUCT';

export type CampaignPlacement = 
  | 'SUPPLIER_CARD' 
  | 'PRODUCT_LIST' 
  | 'SEARCH_RESULT';

export type CampaignTargetType = 
  | 'PRODUCT' 
  | 'CATEGORY' 
  | 'SUPPLIER';

export type DiscountType = 
  | 'PERCENT' 
  | 'AMOUNT';

export interface Campaign {
  id: string;
  supplierId: string;
  type: CampaignType;
  name: string;
  description?: string;
  placement?: CampaignPlacement;
  status: CampaignStatus;
  startDate: Date;
  endDate: Date;
  dailyBudgetUSD?: number;
  totalBudgetUSD?: number;
  spentUSD: number;
  cpmUSD?: number;
  cpcUSD?: number;
  targetType: CampaignTargetType;
  targetIds: string[];
  keywords: string[];
  priorityScore: number;
  discountType?: DiscountType;
  discountValue?: number;
  minQty?: number;
  featureSlots?: number;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignKpis {
  active: number;
  totalBudgetUSD: number;
  totalSpentUSD: number;
  totalImpressions: number;
  totalClicks: number;
  ctr: number;
}

export interface SponsoredItem {
  id: string;
  isSponsored: boolean;
  campaignId?: string;
  sponsorSupplierId?: string;
  sponsoredRank?: number;
  priorityScore?: number;
}

export interface DiscountInfo {
  campaignId: string;
  discountType: DiscountType;
  discountValue: number;
  minQty?: number;
  endDate: Date;
  promoPrice: number;
  compareAtPrice: number;
  savingsPercent: number;
}

export interface FeaturedProduct {
  id: string;
  campaignId: string;
  supplierId: string;
  slots: number;
  endDate: Date;
}
