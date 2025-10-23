import { IsString, IsOptional, IsEnum, IsDateString, IsUUID, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CountType } from '@prisma/client';

export class StartCountDto {
  @IsString()
  restaurantId: string;

  @IsUUID()
  locationId: string;

  @IsEnum(CountType)
  countType: CountType;

  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @IsString()
  conductedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[]; // For cycle counts - specific items to count
}

export class SubmitCountLineDto {
  @IsUUID()
  countId: string;

  @IsUUID()
  itemId: string;

  @IsNumber()
  countedQty: number;

  @IsString()
  uom: string;

  @IsString()
  countedBy: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class FinalizeCountDto {
  @IsUUID()
  countId: string;

  @IsString()
  conductedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

