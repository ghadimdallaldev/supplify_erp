'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  senderId: string; // ID of the sender (restaurant-id or supplier-id)
  senderRole: 'restaurant' | 'supplier';
  text: string;
  timestamp: string;
  read: boolean;
  conversationId: string; // ID of the other party in the conversation
}

interface Conversation {
  [conversationId: string]: Message[];
}

interface OnlineStatus {
  [id: string]: boolean; // Key is supplierId or restaurantId
}

interface Supplier {
  id: string;
  name: string;
  email: string;
  isFavorite: boolean;
}

interface ChatContextType {
  messages: Conversation;
  onlineStatus: OnlineStatus;
  suppliers: Supplier[];
  sendMessage: (
    senderId: string,
    senderRole: 'restaurant' | 'supplier',
    conversationId: string,
    text: string
  ) => void;
  markMessagesAsRead: (conversationId: string, currentUserId: string) => void;
  getUnreadCount: (conversationId: string, currentUserId: string) => number;
  totalUnreadCount: (currentUserId: string) => number;
  setOnline: (id: string, isOnline: boolean) => void;
  toggleSupplierFavorite: (supplierId: string) => void;
  socket: Socket | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Conversation>({});
  const [onlineStatus, setOnlineStatus] = useState<OnlineStatus>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Load suppliers that the restaurant orders from
  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const response = await fetch('/api/restaurants/golden-fork/suppliers');
        if (response.ok) {
          const supplierData = await response.json();
          setSuppliers(supplierData);
        }
      } catch (error) {
        console.error('Failed to load suppliers:', error);
      }
    };

    // Only run on client side
    if (typeof window !== 'undefined') {
      loadSuppliers();
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const chatWsUrl =
          process.env.NEXT_PUBLIC_CHAT_WS_URL || 'http://localhost:3011/chat';
        const newSocket = io(chatWsUrl, {
          auth: {
            userId: 'golden-fork', // This should come from auth context
            orgType: 'RESTAURANT', // This should come from auth context
          },
          timeout: 5000, // 5 second timeout
        });

        newSocket.on('connect', () => {
          console.log('Connected to chat service');
        });

        newSocket.on('connect_error', (error) => {
          console.log('Chat service not available, using API fallback:', error.message);
        });

        newSocket.on('message:new', (message: any) => {
          console.log('New message received:', message);
          // Add the new message to the conversation
          setMessages(prev => {
            const conversationId = message.senderRole === 'restaurant' ? message.senderId : message.senderId;
            const updatedConversation = [...(prev[conversationId] || []), {
              id: message.id,
              senderId: message.senderId,
              senderRole: message.senderRole.toLowerCase(),
              text: message.content,
              timestamp: new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              read: false,
              conversationId,
            }];
            return {
              ...prev,
              [conversationId]: updatedConversation,
            };
          });
        });

        newSocket.on('user:online', (data: { userId: string; orgType: string }) => {
          setOnlineStatus(prev => ({
            ...prev,
            [data.userId]: true,
          }));
        });

        newSocket.on('user:offline', (data: { userId: string; orgType: string }) => {
          setOnlineStatus(prev => ({
            ...prev,
            [data.userId]: false,
          }));
        });

        setSocket(newSocket);

        return () => {
          newSocket.close();
        };
      } catch (error) {
        console.log('WebSocket connection failed, using API fallback');
      }
    }
  }, []);

  const sendMessage = useCallback((
    senderId: string,
    senderRole: 'restaurant' | 'supplier',
    conversationId: string,
    text: string
  ) => {
    if (!text.trim()) return;

    // If socket is connected, send via WebSocket
    if (socket && socket.connected) {
      socket.emit('message:send', {
        conversationId,
        content: text,
        messageType: 'TEXT',
      });
    } else {
      // Fallback to API if WebSocket not available
      fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          threadId: conversationId,
          senderId,
          senderRole: senderRole.toUpperCase(),
          senderName: senderRole === 'restaurant' ? getRestaurantName(senderId) : getSupplierName(senderId),
          body: text,
        }),
      }).then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to send message');
      }).then(newMessage => {
        setMessages(prev => {
          const updatedConversation = [...(prev[conversationId] || []), {
            id: newMessage.id,
            senderId,
            senderRole,
            text: text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            read: false,
            conversationId,
          }];
          return {
            ...prev,
            [conversationId]: updatedConversation,
          };
        });
      }).catch(error => {
        console.error('Failed to send message:', error);
      });
    }

    // Trigger browser notification for the recipient
    if (typeof window !== 'undefined' && Notification.permission === 'granted') {
      const senderName = senderRole === 'restaurant' ? getRestaurantName(senderId) : getSupplierName(senderId);
      new Notification(`New message from ${senderName}`, {
        body: text,
        icon: '/supplify-logo.png',
      });
    }
  }, [socket]);

  const markMessagesAsRead = useCallback((conversationId: string, currentUserId: string) => {
    setMessages(prev => {
      const conversation = prev[conversationId];
      if (!conversation) return prev;

      const updatedConversation = conversation.map(msg =>
        msg.senderId !== currentUserId && !msg.read ? { ...msg, read: true } : msg
      );

      return {
        ...prev,
        [conversationId]: updatedConversation,
      };
    });
  }, []);

  const getUnreadCount = useCallback((conversationId: string, currentUserId: string) => {
    const conversation = messages[conversationId];
    if (!conversation) return 0;
    return conversation.filter(msg => msg.senderId !== currentUserId && !msg.read).length;
  }, [messages]);

  const totalUnreadCount = useCallback((currentUserId: string) => {
    let total = 0;
    for (const convId in messages) {
      total += getUnreadCount(convId, currentUserId);
    }
    return total;
  }, [messages, getUnreadCount]);

  const setOnline = useCallback((id: string, isOnline: boolean) => {
    setOnlineStatus(prev => ({
      ...prev,
      [id]: isOnline,
    }));
  }, []);

  const toggleSupplierFavorite = useCallback((supplierId: string) => {
    setSuppliers(prev => 
      prev.map(supplier => 
        supplier.id === supplierId 
          ? { ...supplier, isFavorite: !supplier.isFavorite }
          : supplier
      )
    );
  }, []);

  const value = {
    messages,
    onlineStatus,
    suppliers,
    sendMessage,
    markMessagesAsRead,
    getUnreadCount,
    totalUnreadCount,
    setOnline,
    toggleSupplierFavorite,
    socket,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};

// Helper functions (can be moved to a utility file)
const getSupplierName = (id: string) => {
  const suppliers: { [key: string]: { name: string } } = {
    'fresh-foods': { name: 'Fresh Foods Supply' },
    'premium-meats': { name: 'Premium Meats Co.' },
    'organic-greens': { name: 'Organic Greens Ltd.' },
  };
  return suppliers[id]?.name || id;
};

const getRestaurantName = (id: string) => {
  const restaurants: { [key: string]: { name: string } } = {
    'golden-fork': { name: 'Golden Fork Restaurant' },
    'bella-vista': { name: 'Bella Vista Bistro' },
    'downtown-bistro': { name: 'Downtown Bistro' },
    'mama-mia': { name: 'Mama Mia Italian' },
    'sunset-grill': { name: 'Sunset Grill' },
  };
  return restaurants[id]?.name || id;
};