import { Controller, Post, Get, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { extractTokenFromHeader, UnauthorizedError } from '@supplify/utils';

import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify token and provision user' })
  async verify(@Body() body: { token: string }) {
    return this.authService.verifyAndProvision(body.token);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  async me(@Headers('authorization') authHeader: string) {
    const token = extractTokenFromHeader(authHeader);
    if (!token) {
      throw new UnauthorizedError('Missing token');
    }

    const { user } = await this.authService.verifyAndProvision(token);
    return user;
  }
}

