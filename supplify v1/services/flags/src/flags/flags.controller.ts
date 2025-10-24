import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { FlagsService } from './flags.service';
import { CreateFlagDto, UpdateFlagDto, CreateRuleDto, CreateOverrideDto } from './dto/flags.dto';

@ApiTags('flags')
@Controller('flags')
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature flags' })
  @ApiResponse({ status: 200, description: 'List of feature flags' })
  async getAllFlags() {
    return this.flagsService.getAllFlags();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get feature flag by ID' })
  @ApiResponse({ status: 200, description: 'Feature flag details' })
  async getFlagById(@Param('id') id: string) {
    return this.flagsService.getFlagById(id);
  }

  @Get('key/:key')
  @ApiOperation({ summary: 'Get feature flag by key' })
  @ApiResponse({ status: 200, description: 'Feature flag details' })
  async getFlagByKey(@Param('key') key: string) {
    return this.flagsService.getFlagByKey(key);
  }

  @Post()
  @ApiOperation({ summary: 'Create new feature flag' })
  @ApiResponse({ status: 201, description: 'Feature flag created' })
  async createFlag(@Body() dto: CreateFlagDto) {
    return this.flagsService.createFlag(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update feature flag' })
  @ApiResponse({ status: 200, description: 'Feature flag updated' })
  async updateFlag(@Param('id') id: string, @Body() dto: UpdateFlagDto) {
    return this.flagsService.updateFlag(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete feature flag' })
  @ApiResponse({ status: 200, description: 'Feature flag deleted' })
  async deleteFlag(@Param('id') id: string) {
    return this.flagsService.deleteFlag(id);
  }

  @Get(':flagId/rules')
  @ApiOperation({ summary: 'Get rules for a feature flag' })
  @ApiResponse({ status: 200, description: 'List of rules' })
  async getRulesByFlag(
    @Param('flagId') flagId: string,
    @Query('environment') environment: string = 'dev'
  ) {
    return this.flagsService.getRulesByFlag(flagId, environment);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create new rule' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async createRule(@Body() dto: CreateRuleDto) {
    return this.flagsService.createRule(dto);
  }

  @Put('rules/:id')
  @ApiOperation({ summary: 'Update rule' })
  @ApiResponse({ status: 200, description: 'Rule updated' })
  async updateRule(@Param('id') id: string, @Body() dto: Partial<CreateRuleDto>) {
    return this.flagsService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete rule' })
  @ApiResponse({ status: 200, description: 'Rule deleted' })
  async deleteRule(@Param('id') id: string) {
    return this.flagsService.deleteRule(id);
  }

  @Get(':flagId/overrides')
  @ApiOperation({ summary: 'Get overrides for a feature flag' })
  @ApiResponse({ status: 200, description: 'List of overrides' })
  async getOverridesByFlag(
    @Param('flagId') flagId: string,
    @Query('environment') environment: string = 'dev'
  ) {
    return this.flagsService.getOverridesByFlag(flagId, environment);
  }

  @Post('overrides')
  @ApiOperation({ summary: 'Create new override' })
  @ApiResponse({ status: 201, description: 'Override created' })
  async createOverride(@Body() dto: CreateOverrideDto) {
    return this.flagsService.createOverride(dto);
  }

  @Put('overrides/:id')
  @ApiOperation({ summary: 'Update override' })
  @ApiResponse({ status: 200, description: 'Override updated' })
  async updateOverride(@Param('id') id: string, @Body() dto: Partial<CreateOverrideDto>) {
    return this.flagsService.updateOverride(id, dto);
  }

  @Delete('overrides/:id')
  @ApiOperation({ summary: 'Delete override' })
  @ApiResponse({ status: 200, description: 'Override deleted' })
  async deleteOverride(@Param('id') id: string) {
    return this.flagsService.deleteOverride(id);
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Get all organizations' })
  @ApiResponse({ status: 200, description: 'List of organizations' })
  async getAllOrganizations() {
    return this.flagsService.getAllOrganizations();
  }

  @Get('evaluate/:flagKey')
  @ApiOperation({ summary: 'Evaluate feature flag' })
  @ApiResponse({ status: 200, description: 'Flag evaluation result' })
  async evaluateFlag(
    @Param('flagKey') flagKey: string,
    @Query('environment') environment: string = 'dev',
    @Query('orgType') orgType?: string,
    @Query('orgId') orgId?: string,
    @Query('userId') userId?: string
  ) {
    return this.flagsService.evaluateFlag(flagKey, environment, {
      orgType,
      orgId,
      userId,
    });
  }

  @Post('seed')
  @ApiOperation({ summary: 'Seed initial data' })
  @ApiResponse({ status: 200, description: 'Data seeded successfully' })
  async seedInitialData() {
    await this.flagsService.seedInitialData();
    return { message: 'Initial data seeded successfully' };
  }

  // RabbitMQ Message Patterns
  @MessagePattern('flags.get.all')
  async handleGetAllFlags(@Payload() data: any) {
    return this.flagsService.getAllFlags();
  }

  @MessagePattern('flags.evaluate')
  async handleEvaluateFlag(@Payload() data: { flagKey: string; context: any }) {
    return this.flagsService.evaluateFlag(
      data.flagKey,
      data.context.env || 'dev',
      {
        orgType: data.context.orgType,
        orgId: data.context.orgId,
        userId: data.context.userId,
      }
    );
  }
}