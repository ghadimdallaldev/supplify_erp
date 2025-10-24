import { Module } from '@nestjs/common';
import { AuthResolver } from './auth.resolver';
import { AuthGuard } from './auth.guard';
// import { KeycloakAdapter } from '@supplify/auth-server';

@Module({
  providers: [AuthResolver, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}

