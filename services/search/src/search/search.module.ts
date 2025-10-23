import { Module } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  providers: [ElasticsearchService, SearchService],
  controllers: [SearchController],
  exports: [SearchService],
})
export class SearchModule {}

