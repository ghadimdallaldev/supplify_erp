import { IsArray, IsString, IsOptional, IsObject, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CartItemInput {
  @IsString()
  @IsNotEmpty()
  supplierProductId: string;

  @IsString()
  @IsOptional()
  restaurantItemId?: string;

  @IsNotEmpty()
  qtyOrderedBase: number;

  @IsString()
  @IsNotEmpty()
  uomBase: string;

  @IsNotEmpty()
  unitPrice: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class DeliveryWindowInput {
  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  date?: string;
}

export class LoyaltyRedemptionInput {
  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsNotEmpty()
  points: number;
}

export class PlaceOrderInput {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemInput)
  items: CartItemInput[];

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryWindowInput)
  deliveryWindow?: DeliveryWindowInput;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LoyaltyRedemptionInput)
  loyaltyRedemptions?: LoyaltyRedemptionInput[];

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}

export class PlaceOrderDto {
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @ValidateNested()
  @Type(() => PlaceOrderInput)
  input: PlaceOrderInput;
}