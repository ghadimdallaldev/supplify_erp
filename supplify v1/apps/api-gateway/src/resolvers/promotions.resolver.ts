import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards, Inject, ForbiddenException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

/**
 * Promotions GraphQL Resolver
 */
@Resolver('Promotion')
export class PromotionsResolver {
  constructor(
    @Inject('PROMOTIONS_SERVICE') private promotionsClient: ClientProxy,
    @Inject('CATALOG_SERVICE') private catalogClient: ClientProxy,
  ) {}

  private getSupplierId(context: any): string {
    return context.req?.user?.supplierId || context.supplierId || 'sup-sysco-001';
  }

  private getRestaurantId(context: any): string {
    return context.req?.user?.restaurantId || context.restaurantId || 'rest-demo-001';
  }

  private isAdmin(context: any): boolean {
    return context.req?.user?.groups?.includes('admin') || false;
  }

  @Query('myPromotions')
  async myPromotions(
    @Args('status') status?: string,
    @Context() context?: any,
  ) {
    const supplierId = this.getSupplierId(context);

    return firstValueFrom(
      this.promotionsClient.send('promotions.getForSupplier', {
        supplierId,
        status,
      }),
    );
  }

  @Query('promotion')
  async promotion(@Args('id') id: string) {
    return firstValueFrom(
      this.promotionsClient.send('promotions.getById', { id }),
    );
  }

  @Query('promotionAnalytics')
  async promotionAnalytics(
    @Args('id') id: string,
    @Args('days') days: number = 30,
  ) {
    return firstValueFrom(
      this.promotionsClient.send('promotions.getAnalytics', { id, days }),
    );
  }

  @Query('activeCampaigns')
  async activeCampaigns(
    @Args('supplierId') supplierId?: string,
    @Args('limit') limit: number = 50,
    @Context() context?: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.promotionsClient.send('promotions.getActive', {
        supplierId,
        limit,
      }),
    );
  }

  @Query('pendingPromotionApprovals')
  async pendingPromotionApprovals(@Context() context: any) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    return firstValueFrom(
      this.promotionsClient.send('promotions.getPending', {}),
    );
  }

  @Query('searchProductsWithSponsored')
  async searchProductsWithSponsored(
    @Args('categoryId') categoryId?: string,
    @Args('query') query?: string,
    @Args('supplierId') supplierId?: string,
    @Args('includeSponsored') includeSponsored: boolean = true,
    @Args('first') first: number = 50,
    @Context() context?: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    // Get organic products from catalog
    const organicProducts = await firstValueFrom(
      this.catalogClient.send('products.search', {
        categoryId,
        query,
        supplierId,
        limit: first,
      }),
    );

    if (!includeSponsored) {
      return organicProducts;
    }

    // Blend with sponsored
    const blended = await firstValueFrom(
      this.promotionsClient.send('ads.blendResults', {
        organicResults: organicProducts.edges || organicProducts,
        options: {
          categoryId,
          searchQuery: query,
          supplierId,
          maxSponsored: 3,
          restaurantId,
        },
      }),
    );

    return {
      edges: blended.map((item: any) => ({ node: item })),
      pageInfo: organicProducts.pageInfo || { hasNextPage: false },
      totalCount: blended.length,
    };
  }

  @Mutation('createPromotion')
  async createPromotion(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    const supplierId = this.getSupplierId(context);

    return firstValueFrom(
      this.promotionsClient.send('promotions.create', {
        supplierId,
        ...input,
      }),
    );
  }

  @Mutation('updatePromotion')
  async updatePromotion(@Args('input') input: any) {
    return firstValueFrom(
      this.promotionsClient.send('promotions.update', input),
    );
  }

  @Mutation('pausePromotion')
  async pausePromotion(
    @Args('id') id: string,
    @Context() context: any,
  ) {
    const userId = context.req?.user?.id || 'user';

    return firstValueFrom(
      this.promotionsClient.send('promotions.pause', { id, userId }),
    );
  }

  @Mutation('resumePromotion')
  async resumePromotion(
    @Args('id') id: string,
    @Context() context: any,
  ) {
    const userId = context.req?.user?.id || 'user';

    return firstValueFrom(
      this.promotionsClient.send('promotions.resume', { id, userId }),
    );
  }

  @Mutation('approvePromotion')
  async approvePromotion(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    const adminId = context.req?.user?.id || 'admin';

    return firstValueFrom(
      this.promotionsClient.send('promotions.approve', {
        promotionId: input.promotionId,
        adminId,
        note: input.note,
      }),
    );
  }

  @Mutation('rejectPromotion')
  async rejectPromotion(
    @Args('input') input: any,
    @Context() context: any,
  ) {
    if (!this.isAdmin(context)) {
      throw new ForbiddenException('Admin access required');
    }

    const adminId = context.req?.user?.id || 'admin';

    return firstValueFrom(
      this.promotionsClient.send('promotions.reject', {
        promotionId: input.promotionId,
        adminId,
        note: input.note,
      }),
    );
  }

  @Mutation('logPromotionImpression')
  async logPromotionImpression(
    @Args('promotionId') promotionId: string,
    @Args('productId') productId: string,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    await firstValueFrom(
      this.promotionsClient.send('promotions.logImpression', {
        promotionId,
        restaurantId,
        productId,
      }),
    );

    return true;
  }

  @Mutation('logPromotionClick')
  async logPromotionClick(
    @Args('promotionId') promotionId: string,
    @Args('productId') productId: string,
    @Context() context: any,
  ) {
    const restaurantId = this.getRestaurantId(context);

    await firstValueFrom(
      this.promotionsClient.send('promotions.logClick', {
        promotionId,
        restaurantId,
        productId,
      }),
    );

    return true;
  }

  @Mutation('logPromotionConversion')
  async logPromotionConversion(
    @Args('promotionId') promotionId: string,
    @Args('orderId') orderId: string,
    @Args('revenue') revenue: number,
  ) {
    await firstValueFrom(
      this.promotionsClient.send('promotions.logConversion', {
        promotionId,
        orderId,
        revenue,
      }),
    );

    return true;
  }
}

