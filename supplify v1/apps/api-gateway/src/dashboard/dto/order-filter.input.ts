import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class OrderFilter {
  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  supplierId?: string;

  @Field({ nullable: true })
  restaurantId?: string;

  @Field({ nullable: true })
  dateFrom?: string;

  @Field({ nullable: true })
  dateTo?: string;
}

@InputType()
export class PageInput {
  @Field({ nullable: true, defaultValue: 1 })
  page?: number;

  @Field({ nullable: true, defaultValue: 20 })
  limit?: number;
}
