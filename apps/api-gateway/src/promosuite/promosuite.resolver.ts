import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import { 
  PromoSuiteCampaign, 
  PromoSuiteKpis, 
  PromoSuiteDiscount, 
  PromoSuiteFeaturedProduct,
  PromoSuiteBlendedResult 
} from './types/promosuite.types';
import { PromoSuiteCampaignInput } from './dto/promosuite.dto';

@Injectable()
@Resolver()
export class PromoSuiteResolver {
  constructor(
    @Inject('PROMOTIONS_SERVICE') private promotionsClient: ClientProxy,
  ) {}

  @Query(() => [PromoSuiteCampaign])
  async myPromoSuiteCampaigns(
    @Args('status', { nullable: true }) status?: string,
    @Args('search', { nullable: true }) search?: string,
  ): Promise<PromoSuiteCampaign[]> {
    return this.promotionsClient.send('promosuite.campaigns.list', { status, search }).toPromise();
  }

  @Query(() => PromoSuiteKpis)
  async myPromoSuiteKpis(): Promise<PromoSuiteKpis> {
    return this.promotionsClient.send('promosuite.campaigns.kpis', {}).toPromise();
  }

  @Query(() => PromoSuiteCampaign)
  async promoSuiteCampaign(@Args('id') id: string): Promise<PromoSuiteCampaign> {
    return this.promotionsClient.send('promosuite.campaigns.get', { id }).toPromise();
  }

  @Query(() => [PromoSuiteCampaign])
  async promoSuiteCampaignsForReview(
    @Args('status', { nullable: true }) status?: string,
  ): Promise<PromoSuiteCampaign[]> {
    return this.promotionsClient.send('promosuite.campaigns.review', { status }).toPromise();
  }

  @Mutation(() => PromoSuiteCampaign)
  async createPromoSuiteCampaign(
    @Args('input') input: PromoSuiteCampaignInput,
  ): Promise<PromoSuiteCampaign> {
    return this.promotionsClient.send('promosuite.campaigns.create', input).toPromise();
  }

  @Mutation(() => PromoSuiteCampaign)
  async updatePromoSuiteCampaign(
    @Args('id') id: string,
    @Args('input') input: PromoSuiteCampaignInput,
  ): Promise<PromoSuiteCampaign> {
    return this.promotionsClient.send('promosuite.campaigns.update', { id, input }).toPromise();
  }

  @Mutation(() => Boolean)
  async pausePromoSuiteCampaign(@Args('id') id: string): Promise<boolean> {
    return this.promotionsClient.send('promosuite.campaigns.pause', { id }).toPromise();
  }

  @Mutation(() => Boolean)
  async resumePromoSuiteCampaign(@Args('id') id: string): Promise<boolean> {
    return this.promotionsClient.send('promosuite.campaigns.resume', { id }).toPromise();
  }

  @Mutation(() => Boolean)
  async deletePromoSuiteCampaign(@Args('id') id: string): Promise<boolean> {
    return this.promotionsClient.send('promosuite.campaigns.delete', { id }).toPromise();
  }

  @Mutation(() => Boolean)
  async approvePromoSuiteCampaign(@Args('id') id: string): Promise<boolean> {
    return this.promotionsClient.send('promosuite.campaigns.approve', { id }).toPromise();
  }

  @Mutation(() => Boolean)
  async rejectPromoSuiteCampaign(
    @Args('id') id: string,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<boolean> {
    return this.promotionsClient.send('promosuite.campaigns.reject', { id, reason }).toPromise();
  }

  @Mutation(() => Boolean)
  async logPromoSuiteImpression(
    @Args('campaignId') campaignId: string,
    @Args('viewId') viewId: string,
  ): Promise<boolean> {
    return this.promotionsClient.send('promosuite.tracking.impression', { campaignId, viewId }).toPromise();
  }

  @Mutation(() => Boolean)
  async logPromoSuiteClick(@Args('campaignId') campaignId: string): Promise<boolean> {
    return this.promotionsClient.send('promosuite.tracking.click', { campaignId }).toPromise();
  }

  // Serving endpoints for restaurant-facing features
  @Query(() => [PromoSuiteDiscount])
  async getPromoSuiteDiscounts(
    @Args('supplierId') supplierId: string,
  ): Promise<PromoSuiteDiscount[]> {
    return this.promotionsClient.send('promosuite.discounts.get', { supplierId }).toPromise();
  }

  @Query(() => [PromoSuiteFeaturedProduct])
  async getPromoSuiteFeaturedProducts(
    @Args('supplierId') supplierId: string,
  ): Promise<PromoSuiteFeaturedProduct[]> {
    return this.promotionsClient.send('promosuite.featured.get', { supplierId }).toPromise();
  }

  @Query(() => PromoSuiteBlendedResult)
  async blendPromoSuiteSupplierResults(
    @Args('organicSuppliers') organicSuppliers: string,
  ): Promise<PromoSuiteBlendedResult> {
    return this.promotionsClient.send('promosuite.blend.suppliers', { organicSuppliers }).toPromise();
  }

  @Query(() => PromoSuiteBlendedResult)
  async blendPromoSuiteProductResults(
    @Args('organicProducts') organicProducts: string,
    @Args('searchQuery', { nullable: true }) searchQuery?: string,
  ): Promise<PromoSuiteBlendedResult> {
    return this.promotionsClient.send('promosuite.blend.products', { organicProducts, searchQuery }).toPromise();
  }
}
