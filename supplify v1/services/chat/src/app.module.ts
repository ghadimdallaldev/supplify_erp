import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    PrismaModule,
    ChatModule,
    HealthModule,
  ],
})
export class AppModule {}

