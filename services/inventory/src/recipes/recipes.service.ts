import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MovementsService } from '../movements/movements.service';

/**
 * Recipes/BOM Service
 * Manages recipes and auto-depletion of components
 */
@Injectable()
export class RecipesService {
  constructor(
    private prisma: PrismaService,
    private movementsService: MovementsService,
  ) {}

  /**
   * Get all recipes for a restaurant
   */
  async getRecipes(restaurantId: string, activeOnly = true) {
    return this.prisma.recipe.findMany({
      where: {
        restaurantId,
        active: activeOnly ? true : undefined,
      },
      include: {
        components: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  /**
   * Get recipe by ID
   */
  async getRecipe(recipeId: string) {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        components: {
          include: {
            item: {
              include: {
                stockOnHand: true,
              },
            },
          },
        },
      },
    });

    if (!recipe) {
      throw new NotFoundException('Recipe not found');
    }

    // Calculate total cost
    let totalCost = 0;
    for (const component of recipe.components) {
      const avgCost = component.item.stockOnHand[0]?.avgCost || 0;
      const qtyNeeded = component.qtyBase * (1 + (component.wastePct || 0) / 100);
      totalCost += qtyNeeded * avgCost;
    }

    return {
      ...recipe,
      estimatedCost: totalCost,
      costPerYield: totalCost / recipe.yieldQty,
    };
  }

  /**
   * Create a new recipe
   */
  async createRecipe(data: {
    restaurantId: string;
    name: string;
    description?: string;
    yieldUom: string;
    yieldQty: number;
    components: Array<{
      itemId: string;
      qtyBase: number;
      uomBase: string;
      wastePct?: number;
    }>;
  }) {
    return this.prisma.recipe.create({
      data: {
        restaurantId: data.restaurantId,
        name: data.name,
        description: data.description,
        yieldUom: data.yieldUom,
        yieldQty: data.yieldQty,
        active: true,
        components: {
          create: data.components,
        },
      },
      include: {
        components: {
          include: { item: true },
        },
      },
    });
  }

  /**
   * Produce recipe - auto-deplete components using FEFO
   */
  async produceRecipe(data: {
    recipeId: string;
    locationId: string;
    quantity: number; // How many recipe yields to produce
    causedBy: string;
    notes?: string;
  }) {
    const recipe = await this.getRecipe(data.recipeId);

    if (!recipe.active) {
      throw new BadRequestException('Recipe is not active');
    }

    // Check if sufficient stock available
    const insufficientItems = [];
    
    for (const component of recipe.components) {
      const qtyNeeded = component.qtyBase * data.quantity * (1 + (component.wastePct || 0) / 100);
      
      const stockOnHand = await this.prisma.stockOnHand.findUnique({
        where: {
          itemId_locationId: {
            itemId: component.itemId,
            locationId: data.locationId,
          },
        },
      });

      if (!stockOnHand || stockOnHand.qtyAvailableBase < qtyNeeded) {
        insufficientItems.push({
          item: component.item.name,
          needed: qtyNeeded,
          available: stockOnHand?.qtyAvailableBase || 0,
        });
      }
    }

    if (insufficientItems.length > 0) {
      throw new BadRequestException({
        message: 'Insufficient stock to produce recipe',
        insufficientItems,
      });
    }

    // Issue components
    const productionId = `PROD-${Date.now()}`;
    const issues = [];

    for (const component of recipe.components) {
      const qtyNeeded = component.qtyBase * data.quantity * (1 + (component.wastePct || 0) / 100);

      const result = await this.movementsService.issueStock({
        itemId: component.itemId,
        locationId: data.locationId,
        qty: qtyNeeded,
        uom: component.uomBase,
        refType: 'RECIPE',
        refId: productionId,
        causedBy: data.causedBy,
        reason: `Recipe production: ${recipe.name} x${data.quantity}`,
        metadata: {
          recipeId: recipe.id,
          recipeName: recipe.name,
          quantity: data.quantity,
          notes: data.notes,
        },
      });

      issues.push(result);
    }

    return {
      productionId,
      recipe: recipe.name,
      quantity: data.quantity,
      yieldProduced: data.quantity * recipe.yieldQty,
      yieldUom: recipe.yieldUom,
      componentsIssued: issues.length,
      estimatedCost: recipe.estimatedCost * data.quantity,
      message: `Produced ${data.quantity} x ${recipe.name}`,
    };
  }

  /**
   * Calculate recipe availability (max qty that can be produced)
   */
  async checkAvailability(recipeId: string, locationId: string) {
    const recipe = await this.getRecipe(recipeId);

    const availability = [];
    let maxProducible = Infinity;

    for (const component of recipe.components) {
      const qtyNeededPerYield = component.qtyBase * (1 + (component.wastePct || 0) / 100);

      const stockOnHand = await this.prisma.stockOnHand.findUnique({
        where: {
          itemId_locationId: {
            itemId: component.itemId,
            locationId,
          },
        },
      });

      const available = stockOnHand?.qtyAvailableBase || 0;
      const canProduce = Math.floor(available / qtyNeededPerYield);

      availability.push({
        item: component.item.name,
        qtyNeededPerYield,
        available,
        canProduce,
      });

      maxProducible = Math.min(maxProducible, canProduce);
    }

    return {
      recipe: recipe.name,
      maxQuantity: maxProducible === Infinity ? 0 : maxProducible,
      components: availability,
    };
  }
}

