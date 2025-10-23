import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, EventPattern } from '@nestjs/microservices';
import { FlagsService } from './flags.service';
import { FlagsEngineService } from './flags-engine.service';

/**
 * RabbitMQ Message Handlers for Feature Flags
 */
@Controller()
export class FlagsHandlers {
  constructor(
    private readonly flagsService: FlagsService,
    private readonly flagsEngine: FlagsEngineService,
  ) {}

  @MessagePattern('flags.evaluate')
  async evaluateFlag(@Payload() data: { key: string; context: any }) {
    return this.flagsEngine.evaluateFlag(data.key, data.context);
  }

  @MessagePattern('flags.evaluateBatch')
  async evaluateFlags(@Payload() data: { keys: string[]; context: any }) {
    return this.flagsEngine.evaluateFlags(data.keys, data.context);
  }

  @MessagePattern('flags.getAll')
  async getAllFlags(@Payload() data: { context: any }) {
    return this.flagsEngine.getAllFlags(data.context);
  }

  @MessagePattern('flags.getForEnvironment')
  async getFlagsForEnvironment(@Payload() data: { environment: string }) {
    return this.flagsService.getFlagsForEnvironment(data.environment);
  }

  @MessagePattern('flags.upsert')
  async upsertFlag(@Payload() data: any) {
    return this.flagsService.upsertFlag(data);
  }

  @MessagePattern('flags.upsertRule')
  async upsertRule(@Payload() data: any) {
    return this.flagsService.upsertRule(data);
  }

  @MessagePattern('flags.createOverride')
  async createOverride(@Payload() data: any) {
    return this.flagsService.createOverride(data);
  }

  @MessagePattern('flags.deleteOverride')
  async deleteOverride(@Payload() data: { overrideId: string; actorId?: string }) {
    return this.flagsService.deleteOverride(data.overrideId, data.actorId);
  }

  @MessagePattern('flags.getAudit')
  async getFlagAudit(@Payload() data: { flagKey: string; limit?: number }) {
    return this.flagsService.getFlagAudit(data.flagKey, data.limit);
  }

  @MessagePattern('flags.invalidateCache')
  async invalidateCache(@Payload() data: { flagKey: string; environment?: string }) {
    await this.flagsEngine.invalidateFlagCache(data.flagKey, data.environment);
    return { success: true };
  }

  // Event handlers
  @EventPattern('flags.changed')
  handleFlagChanged(@Payload() data: any) {
    console.log('Flag changed event received:', data);
    // Other services can subscribe to this to clear their local caches
  }
}

