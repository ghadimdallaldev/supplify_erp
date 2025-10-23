import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AdminService } from './admin.service';
import { AuthGuard, Roles } from '@supplify/auth-server';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('users/:id/approve')
  @Roles(['admin', 'superadmin'])
  @ApiOperation({ summary: 'Approve pending user' })
  async approveUser(
    @Param('id') userId: string,
    @Body() approvalData: {
      clientId: string;
      orgType: 'RESTAURANT' | 'SUPPLIER';
      roles: string[];
    },
  ) {
    return this.adminService.approveUser(userId, approvalData);
  }

  @Post('users/:id/reject')
  @Roles(['admin', 'superadmin'])
  @ApiOperation({ summary: 'Reject pending user' })
  async rejectUser(
    @Param('id') userId: string,
    @Body() rejectionData: { reason: string },
  ) {
    return this.adminService.rejectUser(userId, rejectionData.reason);
  }

  @Get('users/pending')
  @Roles(['admin', 'superadmin'])
  @ApiOperation({ summary: 'Get pending users' })
  async getPendingUsers() {
    return this.adminService.getPendingUsers();
  }

  @Post('client-id/generate')
  @Roles(['admin', 'superadmin'])
  @ApiOperation({ summary: 'Generate client ID' })
  async generateClientId(@Body() data: { orgType: 'RESTAURANT' | 'SUPPLIER'; name: string }) {
    const clientId = this.adminService.generateClientId(data.orgType, data.name);
    return { clientId };
  }

  // Message patterns for microservice communication
  @MessagePattern('admin.approve.user')
  async handleApproveUser(@Payload() data: { userId: string; approvalData: any }) {
    return this.adminService.approveUser(data.userId, data.approvalData);
  }

  @MessagePattern('admin.reject.user')
  async handleRejectUser(@Payload() data: { userId: string; reason: string }) {
    return this.adminService.rejectUser(data.userId, data.reason);
  }

  @MessagePattern('admin.get.pending.users')
  async handleGetPendingUsers() {
    return this.adminService.getPendingUsers();
  }

  @MessagePattern('admin.generate.client.id')
  async handleGenerateClientId(@Payload() data: { orgType: 'RESTAURANT' | 'SUPPLIER'; name: string }) {
    const clientId = this.adminService.generateClientId(data.orgType, data.name);
    return { clientId };
  }
}
