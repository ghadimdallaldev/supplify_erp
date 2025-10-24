import { IsString, IsNumber, IsOptional, IsEnum, IsDateString, IsUUID, Min, IsBoolean } from 'class-validator';
import { MovementType } from '@prisma/client';

export class ReceiveStockDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsString()
  uom: string;

  @IsNumber()
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  lotCode?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsString()
  refType: string; // e.g., "PO"

  @IsOptional()
  @IsString()
  refId?: string;

  @IsString()
  causedBy: string; // User ID

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class IssueStockDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsString()
  uom: string;

  @IsString()
  refType: string; // e.g., "RECIPE", "ORDER"

  @IsOptional()
  @IsString()
  refId?: string;

  @IsString()
  causedBy: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class TransferStockDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  fromLocationId: string;

  @IsUUID()
  toLocationId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsString()
  uom: string;

  @IsString()
  causedBy: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class WasteStockDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsString()
  uom: string;

  @IsString()
  causedBy: string;

  @IsString()
  reason: string; // Required for wastage

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class AdjustStockDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber()
  qtyAdjustment: number; // Can be positive or negative

  @IsString()
  uom: string;

  @IsString()
  causedBy: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  refType?: string; // e.g., "COUNT"

  @IsOptional()
  @IsString()
  refId?: string;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

