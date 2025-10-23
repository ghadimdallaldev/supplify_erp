import { Controller, Get, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';

@ApiTags('cart')
@Controller('cart')
@ApiBearerAuth()
export class CartController {
  constructor(private cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Get current cart' })
  async getCart(@Headers('x-restaurant-id') restaurantId: string) {
    return this.cartService.getOrCreate(restaurantId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Add item to cart' })
  async addItem(
    @Headers('x-restaurant-id') restaurantId: string,
    @Body() dto: AddToCartDto,
  ) {
    return this.cartService.addItem(restaurantId, dto);
  }

  @Put('items/:itemId')
  @ApiOperation({ summary: 'Update cart item' })
  async updateItem(
    @Headers('x-restaurant-id') restaurantId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(restaurantId, itemId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove item from cart' })
  async removeItem(
    @Headers('x-restaurant-id') restaurantId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.cartService.removeItem(restaurantId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear cart' })
  async clearCart(@Headers('x-restaurant-id') restaurantId: string) {
    return this.cartService.clear(restaurantId);
  }
}

