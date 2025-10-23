'use client';

import { ChatThread, ChatMessage } from '@/lib/test-data-generator';

export interface ChatService {
  getThreadsForUser(userId: string, userRole: 'restaurant' | 'supplier'): ChatThread[];
  getThread(threadId: string): ChatThread | null;
  getMessages(threadId: string): ChatMessage[];
  createMessage(threadId: string, senderId: string, content: string): ChatMessage;
  markMessagesAsRead(threadId: string, userId: string): void;
  getUnreadCount(userId: string): number;
}

class LocalStorageChatService implements ChatService {
  getThreadsForUser(userId: string, userRole: 'restaurant' | 'supplier'): ChatThread[] {
    const threads: ChatThread[] = [];
    
    // Get all threads from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('supplify-thread-')) {
        try {
          const thread = JSON.parse(localStorage.getItem(key) || '{}') as ChatThread;
          
          // Filter threads based on user role
          if (userRole === 'restaurant' && thread.restaurantId === userId) {
            threads.push(thread);
          } else if (userRole === 'supplier' && thread.supplierId === userId) {
            threads.push(thread);
          }
        } catch (error) {
          console.error('Error parsing thread:', error);
        }
      }
    }
    
    // Sort by last message time (most recent first)
    return threads.sort((a, b) => {
      const timeA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const timeB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  getThread(threadId: string): ChatThread | null {
    try {
      const thread = localStorage.getItem(`supplify-thread-${threadId}`);
      return thread ? JSON.parse(thread) : null;
    } catch (error) {
      console.error('Error getting thread:', error);
      return null;
    }
  }

  getMessages(threadId: string): ChatMessage[] {
    const messages: ChatMessage[] = [];
    
    // Get all messages for this thread
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('supplify-message-') && key.includes(threadId)) {
        try {
          const message = JSON.parse(localStorage.getItem(key) || '{}') as ChatMessage;
          if (message.threadId === threadId) {
            messages.push(message);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      }
    }
    
    // Sort by timestamp (oldest first)
    return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  createMessage(threadId: string, senderId: string, content: string): ChatMessage {
    const messageId = `msg_${threadId}_${Date.now()}`;
    const thread = this.getThread(threadId);
    
    if (!thread) {
      throw new Error('Thread not found');
    }

    // Get sender info
    const senderKey = `supplify-user-${senderId}`;
    const senderData = JSON.parse(localStorage.getItem(senderKey) || '{}');
    
    const message: ChatMessage = {
      id: messageId,
      threadId: threadId,
      senderId: senderId,
      senderName: senderData.name || 'Unknown',
      senderRole: senderData.role || 'restaurant',
      content: content,
      timestamp: new Date().toISOString(),
      read: false,
      messageType: 'text',
    };

    // Store message
    localStorage.setItem(`supplify-message-${messageId}`, JSON.stringify(message));

    // Update thread with last message info
    thread.lastMessage = content;
    thread.lastMessageAt = message.timestamp;
    thread.updatedAt = new Date().toISOString();
    
    // Increment unread count for the other party
    if (senderData.role === 'restaurant') {
      thread.unreadCount += 1; // Supplier will see this as unread
    } else {
      thread.unreadCount += 1; // Restaurant will see this as unread
    }
    
    localStorage.setItem(`supplify-thread-${threadId}`, JSON.stringify(thread));

    return message;
  }

  markMessagesAsRead(threadId: string, userId: string): void {
    const thread = this.getThread(threadId);
    if (!thread) return;

    // Mark all messages in this thread as read for this user
    const messages = this.getMessages(threadId);
    messages.forEach(message => {
      if (message.senderId !== userId) { // Don't mark own messages as read
        message.read = true;
        localStorage.setItem(`supplify-message-${message.id}`, JSON.stringify(message));
      }
    });

    // Reset unread count for this user
    thread.unreadCount = 0;
    localStorage.setItem(`supplify-thread-${threadId}`, JSON.stringify(thread));
  }

  getUnreadCount(userId: string): number {
    const userData = JSON.parse(localStorage.getItem(`supplify-user-${userId}`) || '{}');
    const userRole = userData.role;
    
    if (!userRole) return 0;

    const threads = this.getThreadsForUser(userId, userRole);
    return threads.reduce((total, thread) => total + thread.unreadCount, 0);
  }
}

// Export singleton instance
export const chatService = new LocalStorageChatService();
