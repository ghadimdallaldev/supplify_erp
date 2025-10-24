import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotFoundError, slugify, createLogger } from '@supplify/utils';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, SearchProductsDto } from './dto';
import { CacheService } from './cache.service';

const logger = createLogger('products-service');

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async create(dto: CreateProductDto) {
    const slug = slugify(dto.name);

    const product = await this.prisma.product.create({
      data: {
        ...dto,
        slug,
        attributes: dto.attributes || {},
      },
      include: {
        category: true,
      },
    });

    await this.cache.invalidate(`product:${product.id}`);
    logger.info(`Product created: ${product.id}`);

    return product;
  }

  async findOne(id: string) {
    const cached = await this.cache.get(`product:${id}`);
    if (cached) {
      return cached;
    }

    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    await this.cache.set(`product:${id}`, product, 300);
    return product;
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundError('Product not found');
    }

    return product;
  }

  async search(dto: SearchProductsDto) {
    const page = dto.page || 1;
    const limit = dto.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      active: true,
    };

    if (dto.query) {
      where.name = {
        contains: dto.query,
        mode: 'insensitive',
      };
    }

    if (dto.categoryId) {
      where.categoryId = dto.categoryId;
    }

    if (dto.supplierId) {
      where.supplierId = dto.supplierId;
    }

    if (dto.minPrice !== undefined || dto.maxPrice !== undefined) {
      where.price = {};
      if (dto.minPrice !== undefined) {
        where.price.gte = dto.minPrice;
      }
      if (dto.maxPrice !== undefined) {
        where.price.lte = dto.maxPrice;
      }
    }

    if (dto.unit) {
      where.unit = dto.unit;
    }

    if (dto.inStock) {
      where.stockQty = { gt: 0 };
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      nodes: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: {
        category: true,
      },
    });

    await this.cache.invalidate(`product:${id}`);
    logger.info(`Product updated: ${id}`);

    return product;
  }

  async delete(id: string) {
    await this.prisma.product.delete({
      where: { id },
    });

    await this.cache.invalidate(`product:${id}`);
    logger.info(`Product deleted: ${id}`);
  }

  async findBySupplier(supplierId: string) {
    return this.prisma.product.findMany({
      where: { supplierId, active: true },
      include: {
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStock(id: string, quantity: number) {
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        stockQty: {
          increment: quantity,
        },
      },
    });

    await this.cache.invalidate(`product:${id}`);
    logger.info(`Stock updated for product ${id}: ${quantity}`);

    return product;
  }
}

