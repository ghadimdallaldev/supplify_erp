import { IsString, IsBoolean, IsArray, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlagDto {
  @ApiProperty()
  @IsString()
  key: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabledByDefault?: boolean = false;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dependencies?: string[] = [];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[] = [];
}

export class UpdateFlagDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  enabledByDefault?: boolean;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dependencies?: string[];

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class CreateRuleDto {
  @ApiProperty()
  @IsString()
  flagId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  environment?: string = 'dev';

  @ApiProperty({ enum: ['OFF', 'ON', 'ROLLOUT'] })
  @IsEnum(['OFF', 'ON', 'ROLLOUT'])
  status: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  rolloutPct?: number = 0;

  @ApiPropertyOptional({ enum: ['SUPPLIER', 'RESTAURANT'] })
  @IsString()
  @IsOptional()
  targetOrgType?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetOrgIds?: string[] = [];

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  priority?: number = 0;

  @ApiPropertyOptional()
  @IsOptional()
  conditions?: any;

  @ApiProperty()
  @IsString()
  createdBy: string;
}

export class CreateOverrideDto {
  @ApiProperty()
  @IsString()
  flagId: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  environment?: string = 'dev';

  @ApiPropertyOptional({ enum: ['SUPPLIER', 'RESTAURANT'] })
  @IsString()
  @IsOptional()
  orgType?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  orgId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ enum: ['FORCE_ON', 'FORCE_OFF'] })
  @IsEnum(['FORCE_ON', 'FORCE_OFF'])
  forcedStatus: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty()
  @IsString()
  createdBy: string;
}
