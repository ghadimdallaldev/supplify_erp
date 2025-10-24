import { IsString, IsOptional, IsNumber, IsArray, IsDateString, IsIn, Min, Max, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CampaignType {
  SPONSORED_VISIBILITY = 'SPONSORED_VISIBILITY',
  DISCOUNT = 'DISCOUNT',
  FEATURED_PRODUCT = 'FEATURED_PRODUCT',
}

export enum DiscountType {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export class CreateCampaignDto {
  @ApiProperty({ enum: CampaignType })
  @IsEnum(CampaignType)
  type: CampaignType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ['SUPPLIER_CARD', 'PRODUCT_LIST', 'SEARCH_RESULT'] })
  @IsString()
  @IsOptional()
  @IsIn(['SUPPLIER_CARD', 'PRODUCT_LIST', 'SEARCH_RESULT'])
  placement?: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  dailyBudgetUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  totalBudgetUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  cpmUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  cpcUSD?: number;

  @ApiProperty({ enum: ['PRODUCT', 'CATEGORY', 'SUPPLIER'] })
  @IsString()
  @IsIn(['PRODUCT', 'CATEGORY', 'SUPPLIER'])
  targetType: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  targetIds: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(10.0)
  priorityScore?: number;

  // Discount specific
  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  @Max(90) // Max 90% discount
  discountValue?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(1)
  minQty?: number;

  // Featured specific
  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(3)
  featureSlots?: number;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: ['SUPPLIER_CARD', 'PRODUCT_LIST', 'SEARCH_RESULT'] })
  @IsString()
  @IsOptional()
  @IsIn(['SUPPLIER_CARD', 'PRODUCT_LIST', 'SEARCH_RESULT'])
  placement?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  dailyBudgetUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  totalBudgetUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  cpmUSD?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  cpcUSD?: number;

  @ApiPropertyOptional({ enum: ['PRODUCT', 'CATEGORY', 'SUPPLIER'] })
  @IsString()
  @IsOptional()
  @IsIn(['PRODUCT', 'CATEGORY', 'SUPPLIER'])
  targetType?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  keywords?: string[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @Max(10.0)
  priorityScore?: number;

  // Discount specific
  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  @Max(90)
  discountValue?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(1)
  minQty?: number;

  // Featured specific
  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(3)
  featureSlots?: number;
}

export class CampaignStatusDto {
  @ApiProperty({ enum: ['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED', 'EXHAUSTED'] })
  @IsString()
  @IsIn(['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ENDED', 'REJECTED', 'EXHAUSTED'])
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}
