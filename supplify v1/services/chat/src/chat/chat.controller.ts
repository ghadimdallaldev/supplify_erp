import { Controller, Get, Post, Body, Param, Query, Delete, Put } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ChatService } from './chat.service';

/**
 * Chat REST Controller
 * HTTP endpoints for chat management
 */
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(
    @Query('userId') userId: string,
    @Query('orgType') orgType: 'RESTAURANT' | 'SUPPLIER',
  ) {
    return this.chatService.getUserConversations(userId, orgType);
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.chatService.getConversation(id, limit, offset);
  }

  @Post('conversations')
  async createConversation(
    @Body() data: { restaurantId: string; supplierId: string },
  ) {
    return this.chatService.getOrCreateConversation(data.restaurantId, data.supplierId);
  }

  @Get('conversations/:id/unread')
  async getUnreadCount(
    @Param('id') conversationId: string,
    @Query('userId') userId: string,
  ) {
    const count = await this.chatService.getUnreadCount(userId, conversationId);
    return { count };
  }

  @Get('conversations/:id/search')
  async searchMessages(
    @Param('id') conversationId: string,
    @Query('q') query: string,
  ) {
    return this.chatService.searchMessages(conversationId, query);
  }

  @Delete('messages/:id')
  async deleteMessage(
    @Param('id') messageId: string,
    @Body('userId') userId: string,
  ) {
    return this.chatService.deleteMessage(messageId, userId);
  }

  @Put('messages/:id')
  async editMessage(
    @Param('id') messageId: string,
    @Body() data: { userId: string; content: string },
  ) {
    return this.chatService.editMessage(messageId, data.userId, data.content);
  }

  @Get('online/:userId')
  async getOnlineStatus(@Param('userId') userId: string) {
    return this.chatService.getOnlineStatus(userId);
  }

  // RMQ Handlers

  @MessagePattern('chat.message.created')
  handleMessageCreated(data: any) {
    console.log('Message created event received:', data);
    // Additional processing (notifications, analytics, etc.)
  }

  @MessagePattern('order.placed')
  async handleOrderPlaced(data: { orderId: string; restaurantId: string; supplierId: string }) {
    // Auto-create conversation and send order notification message
    const conversation = await this.chatService.getOrCreateConversation(
      data.restaurantId,
      data.supplierId,
    );

    await this.chatService.createMessage({
      conversationId: conversation.id,
      senderId: 'system',
      senderType: 'SYSTEM',
      content: `Order #${data.orderId} has been placed`,
      messageType: 'ORDER_REFERENCE',
      metadata: { orderId: data.orderId },
    });
  }
}

