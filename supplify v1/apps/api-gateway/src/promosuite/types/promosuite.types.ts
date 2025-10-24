import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';

@ObjectType()
export class PromoSuiteCampaign {
  @Field(() => ID)
  id: string;

  @Field(() => ID)
  supplierId: string;

  @Field()
  type: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  placement?: string;

  @Field()
  status: string;

  @Field()
  startDate: Date;

  @Field()
  endDate: Date;

  @Field(() => Float, { nullable: true })
  dailyBudgetUSD?: number;

  @Field(() => Float, { nullable: true })
  totalBudgetUSD?: number;

  @Field(() => Float)
  spentUSD: number;

  @Field(() => Float, { nullable: true })
  cpmUSD?: number;

  @Field(() => Float, { nullable: true })
  cpcUSD?: number;

  @Field()
  targetType: string;

  @Field(() => [ID])
  targetIds: string[];

  @Field(() => [String])
  keywords: string[];

  @Field(() => Float)
  priorityScore: number;

  @Field({ nullable: true })
  discountType?: string;

  @Field(() => Float, { nullable: true })
  discountValue?: number;

  @Field(() => Int, { nullable: true })
  minQty?: number;

  @Field(() => Int, { nullable: true })
  featureSlots?: number;

  @Field()
  approved: boolean;

  @Field({ nullable: true })
  approvedBy?: string;

  @Field({ nullable: true })
  approvedAt?: Date;

  @Field()
  createdBy: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class PromoSuiteKpis {
  @Field(() => Int)
  active: number;

  @Field(() => Float)
  totalBudgetUSD: number;

  @Field(() => Float)
  totalSpentUSD: number;

  @Field(() => Int)
  totalImpressions: number;

  @Field(() => Int)
  totalClicks: number;

  @Field(() => Float)
  ctr: number;

  @Field(() => Int)
  discountCampaigns: number;

  @Field(() => Int)
  featuredProducts: number;
}

@ObjectType()
export class PromoSuiteDiscount {
  @Field(() => ID)
  productId: string;

  @Field(() => ID)
  campaignId: string;

  @Field()
  discountType: string;

  @Field(() => Float)
  discountValue: number;

  @Field(() => Int, { nullable: true })
  minQty?: number;

  @Field(() => Float)
  promoPrice: number;

  @Field(() => Float)
  compareAtPrice: number;

  @Field(() => Float)
  savingsPercent: number;

  @Field()
  endDate: Date;
}

@ObjectType()
export class PromoSuiteFeaturedProduct {
  @Field(() => ID)
  productId: string;

  @Field(() => ID)
  campaignId: string;

  @Field(() => ID)
  supplierId: string;

  @Field(() => Int)
  slots: number;

  @Field()
  endDate: Date;
}

@ObjectType()
export class PromoSuiteSponsoredItem {
  @Field(() => ID)
  id: string;

  @Field()
  isSponsored: boolean;

  @Field(() => ID, { nullable: true })
  campaignId?: string;

  @Field(() => ID, { nullable: true })
  sponsorSupplierId?: string;

  @Field(() => Int, { nullable: true })
  sponsoredRank?: number;

  @Field(() => Float, { nullable: true })
  priorityScore?: number;
}

@ObjectType()
export class PromoSuiteBlendedResult {
  @Field(() => [PromoSuiteSponsoredItem])
  items: PromoSuiteSponsoredItem[];

  @Field(() => Int)
  totalSponsored: number;

  @Field(() => Int)
  totalOrganic: number;

  @Field(() => Float)
  sponsoredPercentage: number;
}
