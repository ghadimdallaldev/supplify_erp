import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';

@ApiTags('suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async findAll() {
    return this.prisma.supplier.findMany({ include: { promotions: true } });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: { promotions: true },
    });
  }

  @Get(':id/promotions')
  async getPromotions(@Param('id') id: string) {
    return this.prisma.promotion.findMany({
      where: { supplierId: id, active: true },
    });
  }
}

