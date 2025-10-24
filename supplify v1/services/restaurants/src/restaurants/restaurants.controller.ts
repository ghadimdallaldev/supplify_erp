import { Controller, Get, Post, Delete, Body, Param, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { RestaurantsService } from './restaurants.service';

@ApiTags('restaurants')
@Controller('restaurants')
@ApiBearerAuth()
export class RestaurantsController {
  constructor(private service: RestaurantsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('favorites')
  addFavorite(
    @Headers('x-restaurant-id') restaurantId: string,
    @Body() body: { productId: string },
  ) {
    return this.service.addFavorite(restaurantId, body.productId);
  }

  @Delete('favorites/:productId')
  removeFavorite(
    @Headers('x-restaurant-id') restaurantId: string,
    @Param('productId') productId: string,
  ) {
    return this.service.removeFavorite(restaurantId, productId);
  }

  @Get('favorites/list')
  getFavorites(@Headers('x-restaurant-id') restaurantId: string) {
    return this.service.getFavorites(restaurantId);
  }

  @MessagePattern('restaurants.find')
  handleFind(@Payload() data: { id: string }) {
    return this.service.findOne(data.id);
  }
}

