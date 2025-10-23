import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @MessagePattern('suppliers.restaurant')
  async getRestaurantSuppliers(@Payload() data: { restaurantId: string }) {
    return this.suppliersService.getRestaurantSuppliers(data.restaurantId);
  }

  @MessagePattern('suppliers.add')
  async addSupplier(@Payload() data: { restaurantId: string; supplierId: string }) {
    return this.suppliersService.addSupplier(data.restaurantId, data.supplierId);
  }

  @MessagePattern('suppliers.pin')
  async pinSupplier(@Payload() data: { restaurantId: string; supplierId: string; pinned: boolean }) {
    return this.suppliersService.pinSupplier(data.restaurantId, data.supplierId, data.pinned);
  }

  @MessagePattern('suppliers.feature')
  async featureSupplier(@Payload() data: { restaurantId: string; supplierId: string; featured: boolean }) {
    return this.suppliersService.featureSupplier(data.restaurantId, data.supplierId, data.featured);
  }

  @MessagePattern('suppliers.all')
  async getAllSuppliers() {
    return this.suppliersService.getAllSuppliers();
  }
}