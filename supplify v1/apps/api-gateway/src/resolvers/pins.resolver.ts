import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/**
 * Pinned Products GraphQL Resolver
 * Handles restaurant-scoped product pinning
 */
@Resolver('PinnedProduct')
export class PinsResolver {
  constructor(
    @Inject('RESTAURANTS_SERVICE') private restaurantsClient: ClientProxy,
    @Inject('CATALOG_SERVICE') private catalogClient: ClientProxy,
  ) {}

  /**
   * Get restaurantId from JWT context
   */
  private getRestaurantId(context: any): string {
    // TODO: Extract from Cognito JWT
    // For now, use from context or default
    return context.req?.user?.restaurantId || context.restaurantId;
  }

  @Query('pinnedProducts')
  async pinnedProducts(
    @Args('supplierId') supplierId: string,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    return firstValueFrom(
      this.restaurantsClient.send('pins.get', {
        restaurantId,
        supplierId,
      }),
    );
  }

  @Query('supplierProductsWithPins')
  async supplierProductsWithPins(
    @Args('supplierId') supplierId: string,
    @Args('search') search?: string,
    @Args('categoryId') categoryId?: string,
    @Args('first') first: number = 50,
    @Args('after') after?: string,
    @Context() context?: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    // Step 1: Get pinned products
    const pins = await firstValueFrom(
      this.restaurantsClient.send('pins.get', {
        restaurantId,
        supplierId,
      }),
    );

    const pinnedProductIds = pins.map((p: any) => p.productId);
    const pinsMap = new Map(
      pins.map((p: any) => [p.productId, { sortIndex: p.sortIndex, note: p.note }]),
    );

    // Step 2: Get supplier products
    const productsResponse = await firstValueFrom(
      this.catalogClient.send('products.getBySupplier', {
        supplierId,
        search,
        categoryId,
        limit: first + pinnedProductIds.length, // Get extra to account for pins
        after,
      }),
    );

    const allProducts = productsResponse.edges || [];

    // Step 3: Separate pinned and non-pinned
    const pinnedProducts: any[] = [];
    const nonPinnedProducts: any[] = [];

    allProducts.forEach((edge: any) => {
      const product = edge.node;
      const pinData = pinsMap.get(product.id);

      if (pinData) {
        pinnedProducts.push({
          ...edge,
          node: {
            ...product,
            isPinned: true,
            pinNote: (pinData as any).note,
            pinSortIndex: (pinData as any).sortIndex,
          },
        });
      } else {
        nonPinnedProducts.push(edge);
      }
    });

    // Sort pinned by sortIndex
    pinnedProducts.sort((a, b) => a.node.pinSortIndex - b.node.pinSortIndex);

    // Step 4: Filter pins by search if search query present
    let filteredPinnedProducts = pinnedProducts;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredPinnedProducts = pinnedProducts.filter((edge: any) =>
        edge.node.name?.toLowerCase().includes(searchLower) ||
        edge.node.sku?.toLowerCase().includes(searchLower),
      );
    }

    // Step 5: Merge: pinned first, then non-pinned
    const mergedEdges = [
      ...filteredPinnedProducts,
      ...nonPinnedProducts.slice(0, first - filteredPinnedProducts.length),
    ];

    return {
      edges: mergedEdges.slice(0, first),
      pageInfo: {
        hasNextPage: mergedEdges.length > first || productsResponse.pageInfo?.hasNextPage,
        endCursor: mergedEdges[Math.min(first - 1, mergedEdges.length - 1)]?.cursor,
      },
      totalCount: (productsResponse.totalCount || 0),
    };
  }

  @Mutation('pinProduct')
  async pinProduct(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    const result = await firstValueFrom(
      this.restaurantsClient.send('pins.pin', {
        restaurantId,
        supplierId: input.supplierId,
        productId: input.productId,
        note: input.note,
      }),
    );

    // Publish event
    await firstValueFrom(
      this.restaurantsClient.emit('pins.pinned', {
        restaurantId,
        supplierId: input.supplierId,
        productId: input.productId,
        timestamp: new Date(),
      }),
    );

    return result;
  }

  @Mutation('unpinProduct')
  async unpinProduct(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    const result = await firstValueFrom(
      this.restaurantsClient.send('pins.unpin', {
        restaurantId,
        supplierId: input.supplierId,
        productId: input.productId,
      }),
    );

    // Publish event
    await firstValueFrom(
      this.restaurantsClient.emit('pins.unpinned', {
        restaurantId,
        supplierId: input.supplierId,
        productId: input.productId,
        timestamp: new Date(),
      }),
    );

    return result;
  }

  @Mutation('reorderPinnedProducts')
  async reorderPinnedProducts(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    const result = await firstValueFrom(
      this.restaurantsClient.send('pins.reorder', {
        restaurantId,
        supplierId: input.supplierId,
        productIdsInOrder: input.productIdsInOrder,
      }),
    );

    // Publish event
    await firstValueFrom(
      this.restaurantsClient.emit('pins.reordered', {
        restaurantId,
        supplierId: input.supplierId,
        productIdsInOrder: input.productIdsInOrder,
        timestamp: new Date(),
      }),
    );

    return result;
  }

  @Mutation('updatePinNote')
  async updatePinNote(
    @Args('id') id: string,
    @Args('note') note: string,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    return firstValueFrom(
      this.restaurantsClient.send('pins.updateNote', {
        id,
        restaurantId,
        note,
      }),
    );
  }
}

