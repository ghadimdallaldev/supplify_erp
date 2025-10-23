import { Module } from '@nestjs/common';
import { AuthResolver } from './auth.resolver';
import { AuthGuard } from './auth.guard';
import { AuthService } from '@supplify/auth-proxy';

@Module({
  providers: [AuthResolver, AuthGuard, AuthService],
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}

