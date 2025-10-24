import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { EmailService } from './email.service';

@Module({
  controllers: [NotificationsController],
  providers: [EmailService],
})
export class AppModule {}

