import { Injectable } from '@nestjs/common';
import { ElasticsearchService } from './elasticsearch.service';
import Redis from 'ioredis';

@Injectable()
export class SearchService {
  private redis: Redis;

  constructor(private elasticsearch: ElasticsearchService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  async search(query: string, type: string, filters: any = {}) {
    // Try cache first
    const cacheKey = `search:${type}:${query}:${JSON.stringify(filters)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Search Elasticsearch
    let results;
    switch (type) {
      case 'products':
        results = await this.elasticsearch.searchProducts(query, filters);
        break;
      default:
        throw new Error(`Unknown search type: ${type}`);
    }

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(results));
    return results;
  }

  async indexDocument(type: string, document: any) {
    switch (type) {
      case 'product':
        return this.elasticsearch.indexProduct(document);
      default:
        throw new Error(`Unknown index type: ${type}`);
    }
  }

  async suggest(prefix: string, type: string) {
    return this.elasticsearch.suggestProducts(prefix);
  }
}

