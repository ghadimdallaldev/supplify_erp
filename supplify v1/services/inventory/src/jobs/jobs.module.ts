import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobsService } from './jobs.service';
import { EventsModule } from '../events/events.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventsModule,
    CommonModule,
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}

