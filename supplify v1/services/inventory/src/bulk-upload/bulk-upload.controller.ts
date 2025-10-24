import { Controller, Post, Get, UseInterceptors, UploadedFile, Body, Param, Res, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BulkUploadService } from './bulk-upload.service';

@Controller('bulk-upload')
export class BulkUploadController {
  private readonly logger = new Logger(BulkUploadController.name);

  constructor(private bulkUploadService: BulkUploadService) {}

  @Post('restaurant-inventory')
  @UseInterceptors(FileInterceptor('file'))
  async uploadRestaurantInventory(
    @UploadedFile() file: Express.Multer.File,
    @Body('restaurantId') restaurantId: string,
    @Body('userId') userId: string,
  ) {
    this.logger.log(`Received bulk inventory upload for restaurant ${restaurantId}`);

    if (!file) {
      throw new Error('No file uploaded');
    }

    if (!restaurantId) {
      throw new Error('Restaurant ID is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await this.bulkUploadService.uploadRestaurantInventory(
      file.buffer,
      restaurantId,
      userId,
    );

    return {
      success: result.success,
      message: `Processed ${result.processedRows}/${result.totalRows} items`,
      totalRows: result.totalRows,
      processedRows: result.processedRows,
      errors: result.errors,
      items: result.items,
    };
  }

  @Post('supplier-products')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSupplierProducts(
    @UploadedFile() file: Express.Multer.File,
    @Body('supplierId') supplierId: string,
    @Body('userId') userId: string,
  ) {
    this.logger.log(`Received bulk product upload for supplier ${supplierId}`);

    if (!file) {
      throw new Error('No file uploaded');
    }

    if (!supplierId) {
      throw new Error('Supplier ID is required');
    }

    if (!userId) {
      throw new Error('User ID is required');
    }

    const result = await this.bulkUploadService.uploadSupplierProducts(
      file.buffer,
      supplierId,
      userId,
    );

    return {
      success: result.success,
      message: `Processed ${result.processedRows}/${result.totalRows} products`,
      totalRows: result.totalRows,
      processedRows: result.processedRows,
      errors: result.errors,
      items: result.items,
    };
  }

  @Get('template/restaurant-inventory')
  async downloadRestaurantInventoryTemplate(@Res() res: Response) {
    const buffer = this.bulkUploadService.generateRestaurantInventoryTemplate();
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="restaurant_inventory_template.xlsx"',
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('template/supplier-products')
  async downloadSupplierProductTemplate(@Res() res: Response) {
    const buffer = this.bulkUploadService.generateSupplierProductTemplate();
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="supplier_products_template.xlsx"',
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }
}
