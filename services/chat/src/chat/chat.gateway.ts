import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { Injectable } from '@nestjs/common';

/**
 * Chat WebSocket Gateway
 * Handles real-time messaging between restaurants and suppliers
 */
@Injectable()
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly chatService: ChatService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract user info from auth token (in real app, validate JWT)
      const userId = client.handshake.auth.userId;
      const orgType = client.handshake.auth.orgType;

      if (!userId || !orgType) {
        client.disconnect();
        return;
      }

      // Update online status
      await this.chatService.setOnlineStatus(userId, orgType, true, client.id);

      // Join user to their conversation rooms
      const conversations = await this.chatService.getUserConversations(userId, orgType);
      conversations.forEach((conv) => {
        client.join(`conversation:${conv.id}`);
      });

      // Broadcast online status
      this.server.emit('user:online', { userId, orgType });

      console.log(`✅ Client connected: ${userId} (${orgType})`);
    } catch (error) {
      console.error('Connection error:', error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      const userId = client.handshake.auth.userId;
      const orgType = client.handshake.auth.orgType;

      if (userId && orgType) {
        await this.chatService.setOnlineStatus(userId, orgType, false, null);
        this.server.emit('user:offline', { userId, orgType });
        console.log(`❌ Client disconnected: ${userId}`);
      }
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody() data: {
      conversationId: string;
      content: string;
      messageType?: string;
      metadata?: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.handshake.auth.userId;
      const orgType = client.handshake.auth.orgType;

      const message = await this.chatService.createMessage({
        conversationId: data.conversationId,
        senderId: userId,
        senderType: orgType,
        content: data.content,
        messageType: data.messageType || 'TEXT',
        metadata: data.metadata,
      });

      // Broadcast to conversation room
      this.server.to(`conversation:${data.conversationId}`).emit('message:new', message);

      return { success: true, message };
    } catch (error) {
      console.error('Send message error:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('message:read')
  async handleMarkAsRead(
    @MessageBody() data: { messageId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = client.handshake.auth.userId;

      await this.chatService.markMessageAsRead(data.messageId, userId);

      // Notify sender
      const message = await this.chatService.getMessage(data.messageId);
      this.server
        .to(`conversation:${message.conversationId}`)
        .emit('message:read', { messageId: data.messageId, userId });

      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  @SubscribeMessage('typing:start')
  async handleTypingStart(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.handshake.auth.userId;
    client.to(`conversation:${data.conversationId}`).emit('typing:start', { userId });
  }

  @SubscribeMessage('typing:stop')
  async handleTypingStop(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.handshake.auth.userId;
    client.to(`conversation:${data.conversationId}`).emit('typing:stop', { userId });
  }

  @SubscribeMessage('conversation:join')
  async handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`conversation:${data.conversationId}`);
    return { success: true };
  }
}

