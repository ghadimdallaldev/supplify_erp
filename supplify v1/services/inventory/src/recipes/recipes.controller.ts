import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  @Get('restaurant/:restaurantId')
  getRecipes(
    @Param('restaurantId') restaurantId: string,
    @Query('active') active?: string,
  ) {
    return this.recipesService.getRecipes(
      restaurantId,
      active === undefined ? true : active === 'true',
    );
  }

  @Get(':id')
  getRecipe(@Param('id') id: string) {
    return this.recipesService.getRecipe(id);
  }

  @Post()
  createRecipe(@Body() data: any) {
    return this.recipesService.createRecipe(data);
  }

  @Post('produce')
  produceRecipe(@Body() data: any) {
    return this.recipesService.produceRecipe(data);
  }

  @Get(':id/availability/:locationId')
  checkAvailability(
    @Param('id') id: string,
    @Param('locationId') locationId: string,
  ) {
    return this.recipesService.checkAvailability(id, locationId);
  }
}

