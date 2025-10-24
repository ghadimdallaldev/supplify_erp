import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

/**
 * Elasticsearch Service
 * Advanced search functionality for products, suppliers, orders
 */
@Injectable()
export class ElasticsearchService implements OnModuleInit {
  private client: Client;

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    });
  }

  async onModuleInit() {
    await this.createIndices();
  }

  private async createIndices() {
    const indices = ['products', 'suppliers', 'orders'];
    
    for (const index of indices) {
      const exists = await this.client.indices.exists({ index });
      if (!exists) {
        await this.client.indices.create({
          index,
          body: this.getIndexMapping(index),
        });
        console.log(`✅ Created ${index} index`);
      }
    }
  }

  private getIndexMapping(index: string) {
    const mappings = {
      products: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            sku: { type: 'keyword' },
            name: { type: 'text', analyzer: 'standard' },
            description: { type: 'text' },
            brand: { type: 'keyword' },
            category: { type: 'keyword' },
            supplierId: { type: 'keyword' },
            price: { type: 'float' },
            unit: { type: 'keyword' },
            tags: { type: 'keyword' },
            active: { type: 'boolean' },
            createdAt: { type: 'date' },
          },
        },
      },
      suppliers: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            name: { type: 'text' },
            description: { type: 'text' },
            categories: { type: 'keyword' },
            rating: { type: 'float' },
            active: { type: 'boolean' },
          },
        },
      },
      orders: {
        mappings: {
          properties: {
            id: { type: 'keyword' },
            restaurantId: { type: 'keyword' },
            supplierId: { type: 'keyword' },
            status: { type: 'keyword' },
            total: { type: 'float' },
            createdAt: { type: 'date' },
          },
        },
      },
    };
    return mappings[index as keyof typeof mappings];
  }

  async indexProduct(product: any) {
    return this.client.index({
      index: 'products',
      id: product.id,
      document: product,
    });
  }

  async searchProducts(query: string, filters: any = {}) {
    const must: any[] = [
      {
        multi_match: {
          query,
          fields: ['name^3', 'description^2', 'brand', 'sku'],
          fuzziness: 'AUTO',
        },
      },
    ];

    if (filters.supplierId) must.push({ term: { supplierId: filters.supplierId } });
    if (filters.category) must.push({ term: { category: filters.category } });
    if (filters.active !== undefined) must.push({ term: { active: filters.active } });

    const result = await this.client.search({
      index: 'products',
      body: {
        query: { bool: { must } },
        size: filters.limit || 20,
        from: filters.offset || 0,
        sort: filters.sort || [{ _score: 'desc' }],
        highlight: {
          fields: {
            name: {},
            description: {},
          },
        },
      },
    });

    return {
      hits: result.hits.hits.map((hit: any) => ({
        ...hit._source,
        score: hit._score,
        highlights: hit.highlight,
      })),
      total: result.hits.total,
    };
  }

  async suggestProducts(prefix: string) {
    const result = await this.client.search({
      index: 'products',
      body: {
        suggest: {
          product_suggest: {
            prefix,
            completion: {
              field: 'name',
              fuzzy: { fuzziness: 2 },
              size: 10,
            },
          },
        },
      },
    });

    return result.suggest?.product_suggest[0].options || [];
  }

  async bulkIndexProducts(products: any[]) {
    const operations = products.flatMap((product) => [
      { index: { _index: 'products', _id: product.id } },
      product,
    ]);

    return this.client.bulk({ operations });
  }
}

