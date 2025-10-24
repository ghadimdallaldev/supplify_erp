import { InputType, Field, Int, Float } from '@nestjs/graphql';

@InputType()
export class PromoSuiteCampaignInput {
  @Field()
  type: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  placement?: string;

  @Field()
  startDate: Date;

  @Field()
  endDate: Date;

  @Field(() => Float, { nullable: true })
  dailyBudgetUSD?: number;

  @Field(() => Float, { nullable: true })
  totalBudgetUSD?: number;

  @Field(() => Float, { nullable: true })
  cpmUSD?: number;

  @Field(() => Float, { nullable: true })
  cpcUSD?: number;

  @Field()
  targetType: string;

  @Field(() => [String])
  targetIds: string[];

  @Field(() => [String], { nullable: true })
  keywords?: string[];

  @Field(() => Float, { nullable: true })
  priorityScore?: number;

  @Field({ nullable: true })
  discountType?: string;

  @Field(() => Float, { nullable: true })
  discountValue?: number;

  @Field(() => Int, { nullable: true })
  minQty?: number;

  @Field(() => Int, { nullable: true })
  featureSlots?: number;
}
