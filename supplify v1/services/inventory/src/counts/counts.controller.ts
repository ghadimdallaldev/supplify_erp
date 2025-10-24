import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { CountsService } from './counts.service';
import { StartCountDto, SubmitCountLineDto, FinalizeCountDto } from './dto/count.dto';
import { CountStatus } from '@prisma/client';

@Controller('counts')
export class CountsController {
  constructor(private readonly countsService: CountsService) {}

  @Post('start')
  startCount(@Body() dto: StartCountDto) {
    return this.countsService.startCount(dto);
  }

  @Post('submit-line')
  submitCountLine(@Body() dto: SubmitCountLineDto) {
    return this.countsService.submitCountLine(dto);
  }

  @Post('finalize')
  finalizeCount(@Body() dto: FinalizeCountDto) {
    return this.countsService.finalizeCount(dto);
  }

  @Get(':id')
  getCount(@Param('id') id: string) {
    return this.countsService.getCount(id);
  }

  @Get('restaurant/:restaurantId')
  getCounts(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status?: CountStatus,
  ) {
    return this.countsService.getCounts(restaurantId, status);
  }
}

