import { Controller, Get, Query } from '@nestjs/common';

@Controller('recommendations')
export class RecommendationsController {
  @Get('similar')
  async getSimilar(@Query('productId') productId: string) {
    // Rule-based: return similar products by category + attributes
    return {
      productId,
      similar: [],
      message: 'Similar products based on category and attributes',
    };
  }

  @Get('cheaper')
  async getCheaper(@Query('productId') productId: string) {
    // Rule-based: return cheaper alternatives
    return {
      productId,
      cheaper: [],
      message: 'Cheaper alternatives within tolerance',
    };
  }
}

