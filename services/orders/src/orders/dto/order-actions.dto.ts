import { IsString, IsOptional, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SupplierAcknowledgeDto {
  @ApiProperty()
  @IsString()
  idempotencyKey: string;
}

export class SupplierSetPreparingDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class SupplierDispatchDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  carrier?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  driverName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  driverPhone?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  etaAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class SupplierMarkDeliveredDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  proofUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class RestaurantConfirmDeliveryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  reason: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class PostOrderMessageDto {
  @ApiProperty()
  @IsString()
  body: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachments?: string[];
}
