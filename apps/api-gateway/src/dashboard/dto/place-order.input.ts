import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class PlaceOrderInput {
  @Field(() => [String])
  items: string[];

  @Field()
  deliveryAddress: string;

  @Field({ nullable: true })
  notes?: string;
}
