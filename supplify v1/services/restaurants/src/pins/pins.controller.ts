import {
  Controller,
  Get,
  Post,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PinsService } from './pins.service';

/**
 * Pinned Products Controller
 * REST endpoints for managing restaurant-supplier pinned products
 */
@Controller('pins')
export class PinsController {
  constructor(private readonly pinsService: PinsService) {}

  @Get()
  async getPinnedProducts(
    @Query('restaurantId') restaurantId: string,
    @Query('supplierId') supplierId: string,
  ) {
    return this.pinsService.getPinnedProducts(restaurantId, supplierId);
  }

  @Post('pin')
  async pinProduct(
    @Body()
    body: {
      restaurantId: string;
      supplierId: string;
      productId: string;
      note?: string;
    },
  ) {
    return this.pinsService.pinProduct(
      body.restaurantId,
      body.supplierId,
      body.productId,
      body.note,
    );
  }

  @Delete('unpin')
  async unpinProduct(
    @Body()
    body: {
      restaurantId: string;
      supplierId: string;
      productId: string;
    },
  ) {
    return this.pinsService.unpinProduct(
      body.restaurantId,
      body.supplierId,
      body.productId,
    );
  }

  @Put('reorder')
  async reorderPinnedProducts(
    @Body()
    body: {
      restaurantId: string;
      supplierId: string;
      productIdsInOrder: string[];
    },
  ) {
    return this.pinsService.reorderPinnedProducts(
      body.restaurantId,
      body.supplierId,
      body.productIdsInOrder,
    );
  }

  @Put(':id/note')
  async updatePinNote(
    @Param('id') id: string,
    @Body() body: { restaurantId: string; note: string },
  ) {
    return this.pinsService.updatePinNote(id, body.restaurantId, body.note);
  }
}

