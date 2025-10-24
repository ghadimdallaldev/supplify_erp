import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('loyalty')
@Controller('loyalty')
@ApiBearerAuth()
export class LoyaltyController {
  @Get('summary')
  async getLoyaltySummary() {
    return { success: true, data: {} };
  }
}
