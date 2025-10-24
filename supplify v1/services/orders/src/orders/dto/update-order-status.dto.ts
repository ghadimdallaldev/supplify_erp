import { IsString, IsOptional, IsIn, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ORDER_STATUSES } from '@supplify/config';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ORDER_STATUSES })
  @IsString()
  @IsIn(ORDER_STATUSES)
  status: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  etaAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  cancelReason?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  payload?: any;
}

