import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get('restaurant/:restaurantId')
  getItems(
    @Param('restaurantId') restaurantId: string,
    @Query('active') active?: string,
    @Query('categoryId') categoryId?: string,
    @Query('storageType') storageType?: string,
    @Query('search') search?: string,
  ) {
    return this.itemsService.getItems(restaurantId, {
      active: active ? active === 'true' : undefined,
      categoryId,
      storageType,
      search,
    });
  }

  @Get(':id')
  getItem(@Param('id') id: string) {
    return this.itemsService.getItem(id);
  }

  @Get('barcode/:barcode')
  getItemByBarcode(
    @Param('barcode') barcode: string,
    @Query('restaurantId') restaurantId: string,
  ) {
    return this.itemsService.getItemByBarcode(barcode, restaurantId);
  }

  @Get(':itemId/stock/:locationId')
  getStockOnHand(
    @Param('itemId') itemId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.itemsService.getStockOnHand(itemId, locationId);
  }

  @Get(':itemId/batches/:locationId')
  getBatches(
    @Param('itemId') itemId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.itemsService.getBatches(itemId, locationId);
  }

  @Get(':itemId/ledger')
  getLedger(
    @Param('itemId') itemId: string,
    @Query('locationId') locationId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.itemsService.getLedger(
      itemId,
      locationId,
      limit ? parseInt(limit) : undefined,
    );
  }

  @Post('par-config')
  setParConfig(@Body() data: any) {
    return this.itemsService.setParConfig(data);
  }

  @Get('restaurant/:restaurantId/below-par')
  getItemsBelowPar(
    @Param('restaurantId') restaurantId: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.itemsService.getItemsBelowPar(restaurantId, locationId);
  }
}

