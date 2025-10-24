import { Injectable } from '@nestjs/common';

import { NotFoundError, createLogger } from '@supplify/utils';

import { PrismaService } from '../prisma/prisma.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';

const logger = createLogger('cart-service');

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(restaurantId: string, clientId: string) {
    let cart = await this.prisma.cart.findFirst({
      where: { restaurantId, clientId },
      include: {
        items: true,
      },
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: {
          clientId,
          restaurantId,
        },
        include: {
          items: true,
        },
      });
      logger.info(`Cart created for restaurant: ${restaurantId}, client: ${clientId}`);
    }

    return cart;
  }

  async addItem(restaurantId: string, dto: AddToCartDto, clientId: string) {
    const cart = await this.getOrCreate(restaurantId, clientId);

    // Check if item already exists
    const existingItem = cart.items.find(
      (item) => item.productId === dto.productId,
    );

    if (existingItem) {
      // Update quantity
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          qty: existingItem.qty + dto.qty,
        },
      });
    } else {
      // Add new item
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: dto.productId,
          supplierId: dto.supplierId,
          qty: dto.qty,
          unitPrice: dto.unitPrice,
          notes: dto.notes,
        },
      });
    }

    logger.info(`Item added to cart for restaurant: ${restaurantId}`);

    return this.getOrCreate(restaurantId);
  }

  async updateItem(restaurantId: string, itemId: string, dto: UpdateCartItemDto) {
    const cart = await this.getOrCreate(restaurantId);
    
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundError('Cart item not found');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: dto,
    });

    logger.info(`Cart item updated: ${itemId}`);

    return this.getOrCreate(restaurantId);
  }

  async removeItem(restaurantId: string, itemId: string) {
    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    logger.info(`Item removed from cart: ${itemId}`);

    return this.getOrCreate(restaurantId);
  }

  async clear(restaurantId: string) {
    const cart = await this.getOrCreate(restaurantId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    logger.info(`Cart cleared for restaurant: ${restaurantId}`);

    return this.getOrCreate(restaurantId);
  }
}

