import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateInvoiceInput {
  @Field()
  orderId: string;

  @Field()
  restaurantId: string;

  @Field()
  supplierId: string;

  @Field({ nullable: true })
  issueDate?: string;

  @Field({ nullable: true })
  dueDate?: string;

  @Field({ nullable: true })
  notes?: string;
}
