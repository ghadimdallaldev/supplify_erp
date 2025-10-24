import { Controller, Get, Post, Body, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthContext } from '@supplify/auth-server';

@ApiTags('suppliers')
@Controller('suppliers')
@ApiBearerAuth()
export class SuppliersController {
  @Get()
  async getSuppliers(@Request() req: { ctx: AuthContext }) {
    return { success: true, data: [] };
  }
}
