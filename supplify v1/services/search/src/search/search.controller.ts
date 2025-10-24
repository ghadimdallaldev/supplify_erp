import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') query: string,
    @Query('type') type: string,
    @Query('filters') filters?: string,
  ) {
    const parsedFilters = filters ? JSON.parse(filters) : {};
    return this.searchService.search(query, type, parsedFilters);
  }

  @Get('suggest')
  async suggest(@Query('q') prefix: string, @Query('type') type: string) {
    return this.searchService.suggest(prefix, type);
  }

  @Post('index')
  async index(@Body() data: { type: string; document: any }) {
    return this.searchService.indexDocument(data.type, data.document);
  }

  @MessagePattern('product.created')
  async handleProductCreated(data: any) {
    await this.searchService.indexDocument('product', data);
  }

  @MessagePattern('product.updated')
  async handleProductUpdated(data: any) {
    await this.searchService.indexDocument('product', data);
  }
}

