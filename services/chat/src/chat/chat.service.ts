import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantAwareEventService } from '@supplify/utils';
import { TenantContext } from '@supplify/utils';

export interface ChatMessage {
  id: string;
  threadId: string;
  clientId: string;
  senderId: string;
  senderRole: string;
  senderName?: string;
  body: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  attachments: string[];
  metadata?: any;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  replyToId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatThread {
  id: string;
  clientId: string;
  scope: 'ORDER' | 'ORG' | 'SUPPORT';
  orderId?: string;
  participants: string[];
  title?: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED';
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TypingIndicator {
  userId: string;
  userName?: string;
  isTyping: boolean;
  lastSeen: Date;
}

@Injectable()
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private tenantContext?: TenantContext;
  private eventService?: TenantAwareEventService;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    // Initialize WebSocket connections, event listeners, etc.
  }

  onModuleDestroy() {
    // Cleanup WebSocket connections, event listeners, etc.
  }

  setTenantContext(context: TenantContext) {
    this.tenantContext = context;
  }

  setEventService(eventService: TenantAwareEventService) {
    this.eventService = eventService;
  }

  private getClientId(): string {
    if (!this.tenantContext?.clientId) {
      throw new Error('Tenant context not set');
    }
    return this.tenantContext.clientId;
  }

  // Thread Management
  async createThread(data: {
    scope: 'ORDER' | 'ORG' | 'SUPPORT';
    orderId?: string;
    participants: string[];
    title?: string;
    description?: string;
  }): Promise<ChatThread> {
    const clientId = this.getClientId();

    const thread = await this.prisma.chatThread.create({
      data: {
        ...data,
        clientId,
        status: 'ACTIVE',
      },
    });

    // Emit thread created event
    this.eventService?.emitEvent('chat.thread.created', { thread });

    return thread;
  }

  async getThread(threadId: string): Promise<ChatThread | null> {
    const clientId = this.getClientId();

    return this.prisma.chatThread.findFirst({
      where: {
        id: threadId,
        clientId,
      },
    });
  }

  async getThreads(filters?: {
    scope?: string;
    orderId?: string;
    status?: string;
    participantId?: string;
  }): Promise<ChatThread[]> {
    const clientId = this.getClientId();

    const where: any = { clientId };

    if (filters?.scope) where.scope = filters.scope;
    if (filters?.orderId) where.orderId = filters.orderId;
    if (filters?.status) where.status = filters.status;
    if (filters?.participantId) {
      where.participants = {
        has: filters.participantId,
      };
    }

    return this.prisma.chatThread.findMany({
      where,
      orderBy: {
        lastMessageAt: 'desc',
      },
    });
  }

  async updateThread(threadId: string, data: Partial<ChatThread>): Promise<ChatThread> {
    const clientId = this.getClientId();

    const thread = await this.prisma.chatThread.update({
      where: {
        id: threadId,
        clientId,
      },
      data,
    });

    // Emit thread updated event
    this.eventService?.emitEvent('chat.thread.updated', { thread });

    return thread;
  }

  async archiveThread(threadId: string): Promise<ChatThread> {
    return this.updateThread(threadId, { status: 'ARCHIVED' });
  }

  async closeThread(threadId: string): Promise<ChatThread> {
    return this.updateThread(threadId, { status: 'CLOSED' });
  }

  // Message Management
  async sendMessage(data: {
    threadId: string;
    senderId: string;
    senderRole: string;
    senderName?: string;
    body: string;
    messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
    attachments?: string[];
    metadata?: any;
    replyToId?: string;
  }): Promise<ChatMessage> {
    const clientId = this.getClientId();

    // Verify thread exists and user is participant
    const thread = await this.prisma.chatThread.findFirst({
      where: {
        id: data.threadId,
        clientId,
        participants: {
          has: data.senderId,
        },
      },
    });

    if (!thread) {
      throw new Error('Thread not found or user not authorized');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        ...data,
        clientId,
        messageType: data.messageType || 'TEXT',
        attachments: data.attachments || [],
        status: 'SENT',
      },
    });

    // Update thread's last message time
    await this.prisma.chatThread.update({
      where: { id: data.threadId },
      data: { lastMessageAt: new Date() },
    });

    // Emit message sent event
    this.eventService?.emitEvent('chat.message.sent', { message });

    // Create notifications for other participants
    await this.createNotifications(thread, message);

    return message;
  }

  async getMessages(threadId: string, options?: {
    limit?: number;
    offset?: number;
    before?: Date;
    after?: Date;
  }): Promise<ChatMessage[]> {
    const clientId = this.getClientId();

    const where: any = {
      threadId,
      clientId,
      deletedAt: null,
    };

    if (options?.before) {
      where.createdAt = { lt: options.before };
    }
    if (options?.after) {
      where.createdAt = { gt: options.after };
    }

    return this.prisma.chatMessage.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  async editMessage(messageId: string, body: string): Promise<ChatMessage> {
    const clientId = this.getClientId();

    const message = await this.prisma.chatMessage.update({
      where: {
        id: messageId,
        clientId,
      },
      data: {
        body,
        editedAt: new Date(),
      },
    });

    // Emit message edited event
    this.eventService?.emitEvent('chat.message.edited', { message });

    return message;
  }

  async deleteMessage(messageId: string): Promise<void> {
    const clientId = this.getClientId();

    await this.prisma.chatMessage.update({
      where: {
        id: messageId,
        clientId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Emit message deleted event
    this.eventService?.emitEvent('chat.message.deleted', { messageId });
  }

  // Read Receipts
  async markAsRead(messageId: string, userId: string): Promise<void> {
    const clientId = this.getClientId();

    // Get message to verify it exists and get threadId
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        clientId,
      },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // Upsert read receipt
    await this.prisma.chatReadReceipt.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      create: {
        messageId,
        threadId: message.threadId,
        clientId,
        userId,
        readAt: new Date(),
      },
      update: {
        readAt: new Date(),
      },
    });

    // Update message status to READ if all participants have read it
    await this.updateMessageReadStatus(messageId);

    // Emit read receipt event
    this.eventService?.emitEvent('chat.read_receipt', {
      messageId,
      userId,
      readAt: new Date(),
    });
  }

  async getReadReceipts(messageId: string): Promise<any[]> {
    const clientId = this.getClientId();

    return this.prisma.chatReadReceipt.findMany({
      where: {
        messageId,
        clientId,
      },
    });
  }

  // Typing Indicators
  async setTypingStatus(threadId: string, userId: string, userName: string, isTyping: boolean): Promise<void> {
    const clientId = this.getClientId();

    if (isTyping) {
      await this.prisma.chatTypingIndicator.upsert({
        where: {
          threadId_userId: {
            threadId,
            userId,
          },
        },
        create: {
          threadId,
          clientId,
          userId,
          userName,
          isTyping: true,
          lastSeen: new Date(),
        },
        update: {
          isTyping: true,
          lastSeen: new Date(),
        },
      });
    } else {
      await this.prisma.chatTypingIndicator.updateMany({
        where: {
          threadId,
          userId,
          clientId,
        },
        data: {
          isTyping: false,
          lastSeen: new Date(),
        },
      });
    }

    // Emit typing event
    this.eventService?.emitEvent('chat.typing', {
      threadId,
      userId,
      userName,
      isTyping,
    });
  }

  async getTypingIndicators(threadId: string): Promise<TypingIndicator[]> {
    const clientId = this.getClientId();

    const indicators = await this.prisma.chatTypingIndicator.findMany({
      where: {
        threadId,
        clientId,
        isTyping: true,
      },
    });

    return indicators.map(indicator => ({
      userId: indicator.userId,
      userName: indicator.userName,
      isTyping: indicator.isTyping,
      lastSeen: indicator.lastSeen,
    }));
  }

  // Notifications
  private async createNotifications(thread: ChatThread, message: ChatMessage): Promise<void> {
    const notifications = thread.participants
      .filter(participantId => participantId !== message.senderId)
      .map(participantId => ({
        clientId: this.getClientId(),
        userId: participantId,
        threadId: thread.id,
        messageId: message.id,
        type: 'MESSAGE',
        title: `New message in ${thread.title || 'chat'}`,
        body: message.body.length > 100 ? message.body.substring(0, 100) + '...' : message.body,
        status: 'PENDING',
      }));

    if (notifications.length > 0) {
      await this.prisma.chatNotification.createMany({
        data: notifications,
      });

      // Emit notification events
      notifications.forEach(notification => {
        this.eventService?.emitEvent('chat.notification.created', notification);
      });
    }
  }

  async getNotifications(userId: string, options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<any[]> {
    const clientId = this.getClientId();

    const where: any = {
      clientId,
      userId,
    };

    if (options?.unreadOnly) {
      where.readAt = null;
    }

    return this.prisma.chatNotification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: options?.limit || 20,
    });
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    const clientId = this.getClientId();

    await this.prisma.chatNotification.updateMany({
      where: {
        id: notificationId,
        clientId,
        userId,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  // Utility Methods
  private async updateMessageReadStatus(messageId: string): Promise<void> {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        thread: true,
        readReceipts: true,
      },
    });

    if (!message) return;

    const participantCount = message.thread.participants.length;
    const readCount = message.readReceipts.length;

    if (readCount >= participantCount) {
      await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { status: 'READ' },
      });
    } else {
      await this.prisma.chatMessage.update({
        where: { id: messageId },
        data: { status: 'DELIVERED' },
      });
    }
  }

  // File Upload Support
  async uploadAttachment(file: File, threadId: string): Promise<string> {
    // In a real implementation, this would upload to S3
    // For now, return a mock URL
    const fileName = `${Date.now()}_${file.name}`;
    return `https://s3.amazonaws.com/supplify-chat/${this.getClientId()}/${threadId}/${fileName}`;
  }

  // Search Messages
  async searchMessages(query: string, threadId?: string): Promise<ChatMessage[]> {
    const clientId = this.getClientId();

    const where: any = {
      clientId,
      body: {
        contains: query,
        mode: 'insensitive',
      },
      deletedAt: null,
    };

    if (threadId) {
      where.threadId = threadId;
    }

    return this.prisma.chatMessage.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  // Additional methods for controller compatibility
  async getUserConversations(userId: string, orgType: 'RESTAURANT' | 'SUPPLIER'): Promise<ChatThread[]> {
    const clientId = this.getClientId();
    
    // Get threads where user is a participant
    return this.prisma.chatThread.findMany({
      where: {
        clientId,
        participants: {
          has: userId,
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });
  }

  async getConversation(conversationId: string, limit?: number, offset?: number): Promise<any> {
    const clientId = this.getClientId();
    
    const thread = await this.prisma.chatThread.findFirst({
      where: {
        id: conversationId,
        clientId,
      },
    });

    if (!thread) {
      throw new Error('Conversation not found');
    }

    const messages = await this.getMessages(conversationId, { limit, offset });
    
    return {
      thread,
      messages,
    };
  }

  async getOrCreateConversation(restaurantId: string, supplierId: string): Promise<ChatThread> {
    const clientId = this.getClientId();
    
    // Try to find existing conversation
    let thread = await this.prisma.chatThread.findFirst({
      where: {
        clientId,
        scope: 'ORG',
        participants: {
          hasEvery: [restaurantId, supplierId],
        },
      },
    });

    if (!thread) {
      // Create new conversation
      thread = await this.createThread({
        scope: 'ORG',
        participants: [restaurantId, supplierId],
        title: `Chat between restaurant and supplier`,
        description: `Direct communication channel`,
      });
    }

    return thread;
  }

  async getUnreadCount(userId: string, conversationId: string): Promise<number> {
    const clientId = this.getClientId();
    
    const unreadMessages = await this.prisma.chatMessage.count({
      where: {
        clientId,
        threadId: conversationId,
        senderId: {
          not: userId,
        },
        readReceipts: {
          none: {
            userId,
          },
        },
        deletedAt: null,
      },
    });

    return unreadMessages;
  }

  async searchMessages(conversationId: string, query: string): Promise<ChatMessage[]> {
    const clientId = this.getClientId();
    
    return this.prisma.chatMessage.findMany({
      where: {
        clientId,
        threadId: conversationId,
        body: {
          contains: query,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const clientId = this.getClientId();
    
    // Verify user owns the message
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        clientId,
        senderId: userId,
      },
    });

    if (!message) {
      throw new Error('Message not found or not authorized');
    }

    await this.deleteMessage(messageId);
  }

  async editMessage(messageId: string, userId: string, content: string): Promise<ChatMessage> {
    const clientId = this.getClientId();
    
    // Verify user owns the message
    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        clientId,
        senderId: userId,
      },
    });

    if (!message) {
      throw new Error('Message not found or not authorized');
    }

    return this.editMessage(messageId, content);
  }

  async getOnlineStatus(userId: string): Promise<boolean> {
    const clientId = this.getClientId();
    
    const typingIndicator = await this.prisma.chatTypingIndicator.findFirst({
      where: {
        clientId,
        userId,
        isTyping: true,
        lastSeen: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Active within last 5 minutes
        },
      },
    });

    return !!typingIndicator;
  }

  async createMessage(data: {
    conversationId: string;
    senderId: string;
    senderType: string;
    content: string;
    messageType?: string;
    metadata?: any;
  }): Promise<ChatMessage> {
    return this.sendMessage({
      threadId: data.conversationId,
      senderId: data.senderId,
      senderRole: data.senderType,
      body: data.content,
      messageType: (data.messageType as any) || 'TEXT',
      metadata: data.metadata,
    });
  }
}