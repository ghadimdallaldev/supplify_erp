import { Module } from '@nestjs/common';
import { PinsController } from './pins.controller';
import { PinsService } from './pins.service';
import { PinsHandlers } from './pins.handlers';

@Module({
  controllers: [PinsController, PinsHandlers],
  providers: [PinsService],
  exports: [PinsService],
})
export class PinsModule {}

