import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ProductsService } from './products.service';
import { ImagesService } from './images.service';
import { CreateProductDto, UpdateProductDto, SearchProductsDto } from './dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private imagesService: ImagesService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new product' })
  async create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Search products' })
  async search(@Query() dto: SearchProductsDto) {
    return this.productsService.search(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  async findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get product by slug' })
  async findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }

  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product' })
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a product' })
  async delete(@Param('id') id: string) {
    await this.productsService.delete(id);
    return { success: true };
  }

  @Post(':id/images/upload-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned URL for image upload' })
  async getUploadUrl(@Param('id') id: string, @Body() body: { fileName: string; contentType: string }) {
    return this.imagesService.getUploadUrl(id, body.fileName, body.contentType);
  }

  // RabbitMQ message patterns
  @MessagePattern('catalog.product.find')
  async handleFindProduct(@Payload() data: { id: string }) {
    return this.productsService.findOne(data.id);
  }

  @MessagePattern('catalog.products.search')
  async handleSearchProducts(@Payload() data: SearchProductsDto) {
    return this.productsService.search(data);
  }

  @MessagePattern('catalog.product.updateStock')
  async handleUpdateStock(@Payload() data: { id: string; quantity: number }) {
    return this.productsService.updateStock(data.id, data.quantity);
  }
}

