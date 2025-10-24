import { Injectable } from '@nestjs/common';

import { NotFoundError, slugify, createLogger } from '@supplify/utils';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

const logger = createLogger('categories-service');

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    
    // Build path
    let path = slug;
    if (dto.parentId) {
      const parent = await this.findOne(dto.parentId);
      path = `${parent.path}/${slug}`;
    }

    const category = await this.prisma.category.create({
      data: {
        ...dto,
        slug,
        path,
      },
    });

    logger.info(`Category created: ${category.id}`);
    return category;
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    return category;
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: {
        parent: true,
        children: true,
      },
      orderBy: { path: 'asc' },
    });
  }

  async findRoots() {
    return this.prisma.category.findMany({
      where: { parentId: null },
      include: {
        children: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });

    logger.info(`Category updated: ${id}`);
    return category;
  }

  async delete(id: string) {
    await this.prisma.category.delete({
      where: { id },
    });

    logger.info(`Category deleted: ${id}`);
  }
}

