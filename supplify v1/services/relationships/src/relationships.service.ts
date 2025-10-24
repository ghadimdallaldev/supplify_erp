import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateRelationshipDto {
  supplierId: string;
  restaurantId: string;
  type?: 'FRIEND' | 'BLOCKED' | 'PENDING';
  notes?: string;
  tags?: string[];
}

export interface UpdateRelationshipDto {
  type?: 'FRIEND' | 'BLOCKED' | 'PENDING';
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  notes?: string;
  tags?: string[];
}

export interface SearchSuppliersDto {
  restaurantId: string;
  searchTerm?: string;
  type?: 'FRIEND' | 'BLOCKED' | 'PENDING';
  limit?: number;
  offset?: number;
}

export interface SearchRestaurantsDto {
  supplierId: string;
  searchTerm?: string;
  type?: 'FRIEND' | 'BLOCKED' | 'PENDING';
  limit?: number;
  offset?: number;
}

@Injectable()
export class RelationshipsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new relationship between supplier and restaurant
   */
  async createRelationship(dto: CreateRelationshipDto) {
    // Check if relationship already exists
    const existing = await this.prisma.relationship.findUnique({
      where: {
        supplierId_restaurantId: {
          supplierId: dto.supplierId,
          restaurantId: dto.restaurantId,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Relationship already exists');
    }

    return this.prisma.relationship.create({
      data: {
        supplierId: dto.supplierId,
        restaurantId: dto.restaurantId,
        type: dto.type || 'FRIEND',
        notes: dto.notes,
        tags: dto.tags || [],
      },
    });
  }

  /**
   * Update an existing relationship
   */
  async updateRelationship(id: string, dto: UpdateRelationshipDto) {
    const relationship = await this.prisma.relationship.findUnique({
      where: { id },
    });

    if (!relationship) {
      throw new NotFoundException('Relationship not found');
    }

    return this.prisma.relationship.update({
      where: { id },
      data: {
        type: dto.type,
        status: dto.status,
        notes: dto.notes,
        tags: dto.tags,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get relationships for a supplier
   */
  async getSupplierRelationships(supplierId: string, type?: string) {
    const where: any = { supplierId };
    if (type) {
      where.type = type;
    }

    return this.prisma.relationship.findMany({
      where,
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { lastInteractionAt: 'desc' },
    });
  }

  /**
   * Get relationships for a restaurant
   */
  async getRestaurantRelationships(restaurantId: string, type?: string) {
    const where: any = { restaurantId };
    if (type) {
      where.type = type;
    }

    return this.prisma.relationship.findMany({
      where,
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { lastInteractionAt: 'desc' },
    });
  }

  /**
   * Search for suppliers (for restaurants)
   */
  async searchSuppliers(dto: SearchSuppliersDto) {
    const where: any = {};
    
    if (dto.searchTerm) {
      where.supplierId = {
        contains: dto.searchTerm,
        mode: 'insensitive',
      };
    }

    if (dto.type) {
      where.type = dto.type;
    }

    // Exclude already existing relationships
    const existingRelationships = await this.prisma.relationship.findMany({
      where: { restaurantId: dto.restaurantId },
      select: { supplierId: true },
    });

    const existingSupplierIds = existingRelationships.map(r => r.supplierId);
    if (existingSupplierIds.length > 0) {
      where.supplierId = {
        notIn: existingSupplierIds,
      };
    }

    return this.prisma.relationship.findMany({
      where,
      take: dto.limit || 20,
      skip: dto.offset || 0,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Search for restaurants (for suppliers)
   */
  async searchRestaurants(dto: SearchRestaurantsDto) {
    const where: any = {};
    
    if (dto.searchTerm) {
      where.restaurantId = {
        contains: dto.searchTerm,
        mode: 'insensitive',
      };
    }

    if (dto.type) {
      where.type = dto.type;
    }

    // Exclude already existing relationships
    const existingRelationships = await this.prisma.relationship.findMany({
      where: { supplierId: dto.supplierId },
      select: { restaurantId: true },
    });

    const existingRestaurantIds = existingRelationships.map(r => r.restaurantId);
    if (existingRestaurantIds.length > 0) {
      where.restaurantId = {
        notIn: existingRestaurantIds,
      };
    }

    return this.prisma.relationship.findMany({
      where,
      take: dto.limit || 20,
      skip: dto.offset || 0,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Add interaction to a relationship
   */
  async addInteraction(relationshipId: string, type: string, description?: string, metadata?: any) {
    return this.prisma.interaction.create({
      data: {
        relationshipId,
        type,
        description,
        metadata,
      },
    });
  }

  /**
   * Get relationship by ID
   */
  async getRelationship(id: string) {
    const relationship = await this.prisma.relationship.findUnique({
      where: { id },
      include: {
        interactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!relationship) {
      throw new NotFoundException('Relationship not found');
    }

    return relationship;
  }

  /**
   * Delete a relationship
   */
  async deleteRelationship(id: string) {
    const relationship = await this.prisma.relationship.findUnique({
      where: { id },
    });

    if (!relationship) {
      throw new NotFoundException('Relationship not found');
    }

    return this.prisma.relationship.delete({
      where: { id },
    });
  }

  /**
   * Get favorite suppliers for a restaurant
   */
  async getFavoriteSuppliers(restaurantId: string) {
    return this.prisma.relationship.findMany({
      where: {
        restaurantId,
        type: 'FRIEND',
        status: 'ACTIVE',
      },
      orderBy: { lastInteractionAt: 'desc' },
    });
  }

  /**
   * Get favorite restaurants for a supplier
   */
  async getFavoriteRestaurants(supplierId: string) {
    return this.prisma.relationship.findMany({
      where: {
        supplierId,
        type: 'FRIEND',
        status: 'ACTIVE',
      },
      orderBy: { lastInteractionAt: 'desc' },
    });
  }

  /**
   * Update last interaction timestamp
   */
  async updateLastInteraction(supplierId: string, restaurantId: string) {
    return this.prisma.relationship.updateMany({
      where: {
        supplierId,
        restaurantId,
      },
      data: {
        lastInteractionAt: new Date(),
      },
    });
  }
}
