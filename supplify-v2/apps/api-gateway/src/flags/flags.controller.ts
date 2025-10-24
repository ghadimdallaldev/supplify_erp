import { Controller, Get, Post, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FlagsService } from './flags.service';
import { AuthContext } from '@supplify/auth-server';

@ApiTags('flags')
@Controller('flags')
@ApiBearerAuth()
export class FlagsController {
  constructor(private readonly flagsService: FlagsService) {}

  @Get()
  @ApiOperation({ summary: 'Get effective feature flags for user' })
  @ApiResponse({ status: 200, description: 'Feature flags retrieved successfully' })
  async getFlags(@Request() req: { ctx: AuthContext }) {
    const flags = await this.flagsService.getEffectiveFlags(req.ctx);
    return {
      success: true,
      data: flags,
    };
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Toggle a feature flag (admin only)' })
  @ApiResponse({ status: 200, description: 'Feature flag toggled successfully' })
  async toggleFlag(
    @Request() req: { ctx: AuthContext },
    @Body() body: { key: string; enabled: boolean; scope?: string }
  ) {
    const result = await this.flagsService.toggleFlag(req.ctx, body.key, body.enabled, body.scope);
    return {
      success: true,
      data: result,
    };
  }
}
