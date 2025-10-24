import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, EventPattern } from '@nestjs/microservices';
import { PinsService } from './pins.service';

/**
 * RabbitMQ Message Handlers for Pins
 */
@Controller()
export class PinsHandlers {
  constructor(private readonly pinsService: PinsService) {}

  @MessagePattern('pins.get')
  async getPinnedProducts(@Payload() data: { restaurantId: string; supplierId: string }) {
    return this.pinsService.getPinnedProducts(data.restaurantId, data.supplierId);
  }

  @MessagePattern('pins.pin')
  async pinProduct(
    @Payload() data: {
      restaurantId: string;
      supplierId: string;
      productId: string;
      note?: string;
    },
  ) {
    return this.pinsService.pinProduct(
      data.restaurantId,
      data.supplierId,
      data.productId,
      data.note,
    );
  }

  @MessagePattern('pins.unpin')
  async unpinProduct(
    @Payload() data: {
      restaurantId: string;
      supplierId: string;
      productId: string;
    },
  ) {
    return this.pinsService.unpinProduct(
      data.restaurantId,
      data.supplierId,
      data.productId,
    );
  }

  @MessagePattern('pins.reorder')
  async reorderPinnedProducts(
    @Payload() data: {
      restaurantId: string;
      supplierId: string;
      productIdsInOrder: string[];
    },
  ) {
    return this.pinsService.reorderPinnedProducts(
      data.restaurantId,
      data.supplierId,
      data.productIdsInOrder,
    );
  }

  @MessagePattern('pins.updateNote')
  async updatePinNote(
    @Payload() data: {
      id: string;
      restaurantId: string;
      note: string;
    },
  ) {
    return this.pinsService.updatePinNote(data.id, data.restaurantId, data.note);
  }

  // Event Handlers (for analytics, etc.)
  @EventPattern('pins.pinned')
  handlePinned(@Payload() data: any) {
    console.log('Product pinned event:', data);
    // Analytics service can listen to this
  }

  @EventPattern('pins.unpinned')
  handleUnpinned(@Payload() data: any) {
    console.log('Product unpinned event:', data);
  }

  @EventPattern('pins.reordered')
  handleReordered(@Payload() data: any) {
    console.log('Pins reordered event:', data);
  }
}

