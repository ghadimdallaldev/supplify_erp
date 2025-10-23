import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { ItemsService } from '../items/items.service';
import { MovementsService } from '../movements/movements.service';
import { CountsService } from '../counts/counts.service';
import { RecipesService } from '../recipes/recipes.service';
import { ValuationService } from '../common/valuation.service';
import { PrismaService } from '../prisma/prisma.service';

@Resolver()
export class InventoryResolver {
  constructor(
    private itemsService: ItemsService,
    private movementsService: MovementsService,
    private countsService: CountsService,
    private recipesService: RecipesService,
    private valuationService: ValuationService,
    private prisma: PrismaService,
  ) {}

  // ============================================================================
  // QUERIES
  // ============================================================================

  @Query('inventoryItems')
  async inventoryItems(@Args('filter') filter: any, @Args('paging') paging?: any) {
    return this.itemsService.getItems(filter.restaurantId, {
      active: filter.active,
      categoryId: filter.categoryId,
      storageType: filter.storageType,
      search: filter.search,
    });
  }

  @Query('inventoryItem')
  async inventoryItem(@Args('id') id: string) {
    return this.itemsService.getItem(id);
  }

  @Query('itemByBarcode')
  async itemByBarcode(
    @Args('barcode') barcode: string,
    @Args('restaurantId') restaurantId: string,
  ) {
    return this.itemsService.getItemByBarcode(barcode, restaurantId);
  }

  @Query('stockOnHand')
  async stockOnHand(@Args('itemId') itemId: string, @Args('locationId') locationId: string) {
    return this.itemsService.getStockOnHand(itemId, locationId);
  }

  @Query('batches')
  async batches(@Args('itemId') itemId: string, @Args('locationId') locationId: string) {
    return this.itemsService.getBatches(itemId, locationId);
  }

  @Query('ledger')
  async ledger(
    @Args('itemId') itemId: string,
    @Args('locationId') locationId?: string,
    @Args('limit') limit?: number,
  ) {
    return this.itemsService.getLedger(itemId, locationId, limit);
  }

  @Query('counts')
  async counts(@Args('restaurantId') restaurantId: string, @Args('status') status?: any) {
    return this.countsService.getCounts(restaurantId, status);
  }

  @Query('count')
  async count(@Args('id') id: string) {
    return this.countsService.getCount(id);
  }

  @Query('valuation')
  async valuation(@Args('restaurantId') restaurantId: string, @Args('method') method: any) {
    return this.valuationService.calculateValuation(restaurantId, method);
  }

  @Query('parSuggestions')
  async parSuggestions(
    @Args('restaurantId') restaurantId: string,
    @Args('locationId') locationId?: string,
  ) {
    const itemsBelowPar = await this.itemsService.getItemsBelowPar(restaurantId, locationId);

    return itemsBelowPar.map((item: any) => ({
      item: item.item,
      location: item.location,
      qtyAvailable: item.qtyAvailableBase,
      reorderPoint: item.parConfig.reorderPoint,
      reorderQty: item.parConfig.reorderQty,
      qtyToOrder: item.qtyToOrder,
      parConfig: item.parConfig,
      supplierLinks: item.item.supplierLinks || [],
    }));
  }

  @Query('recipes')
  async recipes(
    @Args('restaurantId') restaurantId: string,
    @Args('activeOnly') activeOnly?: boolean,
  ) {
    return this.recipesService.getRecipes(restaurantId, activeOnly ?? true);
  }

  @Query('recipe')
  async recipe(@Args('id') id: string) {
    return this.recipesService.getRecipe(id);
  }

  @Query('recipeAvailability')
  async recipeAvailability(@Args('recipeId') recipeId: string, @Args('locationId') locationId: string) {
    return this.recipesService.checkAvailability(recipeId, locationId);
  }

  @Query('alerts')
  async alerts(
    @Args('restaurantId') restaurantId: string,
    @Args('acknowledged') acknowledged?: boolean,
  ) {
    return this.prisma.alert.findMany({
      where: {
        restaurantId,
        acknowledged: acknowledged,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  @Mutation('receiveStock')
  async receiveStock(@Args('input') input: any) {
    return this.movementsService.receiveStock(input);
  }

  @Mutation('issueStock')
  async issueStock(@Args('input') input: any) {
    return this.movementsService.issueStock(input);
  }

  @Mutation('transferStock')
  async transferStock(@Args('input') input: any) {
    return this.movementsService.transferStock(input);
  }

  @Mutation('recordWaste')
  async recordWaste(@Args('input') input: any) {
    return this.movementsService.wasteStock(input);
  }

  @Mutation('startCount')
  async startCount(@Args('input') input: any) {
    return this.countsService.startCount(input);
  }

  @Mutation('submitCountLine')
  async submitCountLine(@Args('input') input: any) {
    return this.countsService.submitCountLine(input);
  }

  @Mutation('finalizeCount')
  async finalizeCount(
    @Args('countId') countId: string,
    @Args('conductedBy') conductedBy: string,
    @Args('notes') notes?: string,
  ) {
    return this.countsService.finalizeCount({ countId, conductedBy, notes });
  }

  @Mutation('setParConfig')
  async setParConfig(@Args('input') input: any) {
    return this.itemsService.setParConfig(input);
  }

  @Mutation('createRecipe')
  async createRecipe(@Args('input') input: any) {
    return this.recipesService.createRecipe(input);
  }

  @Mutation('postRecipeProduction')
  async postRecipeProduction(@Args('input') input: any) {
    return this.recipesService.produceRecipe(input);
  }

  @Mutation('acknowledgeAlert')
  async acknowledgeAlert(@Args('id') id: string, @Args('acknowledgedBy') acknowledgedBy: string) {
    return this.prisma.alert.update({
      where: { id },
      data: {
        acknowledged: true,
        acknowledgedBy,
        acknowledgedAt: new Date(),
      },
    });
  }
}

