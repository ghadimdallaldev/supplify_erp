import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserManagementService } from '../user-management/user-management.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, UserManagementService],
  exports: [AuthService, UserManagementService],
})
export class AuthModule {}

