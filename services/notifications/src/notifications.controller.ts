import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { EmailService } from './email.service';

@Controller()
export class NotificationsController {
  constructor(private emailService: EmailService) {}

  @EventPattern('order.created')
  async handleOrderCreated(data: { orderId: string; restaurantId: string }) {
    await this.emailService.sendEmail(
      'restaurant@example.com',
      'Order Confirmation',
      `<p>Your order ${data.orderId} has been created.</p>`,
    );
  }

  @EventPattern('order.status.changed')
  async handleOrderStatusChanged(data: { orderId: string; status: string }) {
    await this.emailService.sendEmail(
      'restaurant@example.com',
      'Order Status Update',
      `<p>Your order ${data.orderId} status is now: ${data.status}</p>`,
    );
  }
}

