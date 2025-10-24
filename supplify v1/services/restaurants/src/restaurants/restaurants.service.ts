import { Injectable } from '@nestjs/common';

import { NotFoundError } from '@supplify/utils';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RestaurantsService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: { addresses: true, favorites: true },
    });
    if (!restaurant) throw new NotFoundError('Restaurant not found');
    return restaurant;
  }

  async create(data: { orgName: string; cuisine?: string }) {
    return this.prisma.restaurant.create({ data });
  }

  async addFavorite(restaurantId: string, productId: string) {
    return this.prisma.favorite.create({
      data: { restaurantId, productId },
    });
  }

  async removeFavorite(restaurantId: string, productId: string) {
    await this.prisma.favorite.deleteMany({
      where: { restaurantId, productId },
    });
  }

  async getFavorites(restaurantId: string) {
    return this.prisma.favorite.findMany({
      where: { restaurantId },
    });
  }
}

