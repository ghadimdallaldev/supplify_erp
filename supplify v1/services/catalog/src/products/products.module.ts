import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ImagesService } from './images.service';
import { CacheService } from './cache.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ImagesService, CacheService],
  exports: [ProductsService],
})
export class ProductsModule {}

