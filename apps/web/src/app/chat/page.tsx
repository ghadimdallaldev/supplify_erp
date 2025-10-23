'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Image, Paperclip, Search, MoreVertical } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

/**
 * Chat Page
 * Real-time messaging between restaurants and suppliers
 */
export default function ChatPage() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Connect to WebSocket
  useEffect(() => {
    const newSocket = io('http://localhost:3011/chat', {
      auth: {
        userId: 'user_123', // From auth context
        orgType: 'RESTAURANT', // From auth context
      },
    });

    newSocket.on('connect', () => console.log('✅ Connected to chat'));
    newSocket.on('message:new', (message) => {
      queryClient.setQueryData(
        ['messages', selectedConversation?.id],
        (old: any) => [...(old || []), message]
      );
      scrollToBottom();
    });

    newSocket.on('typing:start', ({ userId }) => setIsTyping(true));
    newSocket.on('typing:stop', () => setIsTyping(false));

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fetch conversations
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await fetch('/api/chat/conversations?userId=user_123&orgType=RESTAURANT');
      return res.json();
    },
  });

  // Fetch messages for selected conversation
  const { data: messages } = useQuery({
    queryKey: ['messages', selectedConversation?.id],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const res = await fetch(`/api/chat/conversations/${selectedConversation.id}`);
      const data = await res.json();
      return data.messages || [];
    },
    enabled: !!selectedConversation,
  });

  const handleSendMessage = () => {
    if (!messageInput.trim() || !socket || !selectedConversation) return;

    socket.emit('message:send', {
      conversationId: selectedConversation.id,
      content: messageInput,
      messageType: 'TEXT',
    });

    setMessageInput('');
    socket.emit('typing:stop', { conversationId: selectedConversation.id });
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    if (socket && selectedConversation) {
      socket.emit('typing:start', { conversationId: selectedConversation.id });
      
      // Stop typing after 1s of inactivity
      clearTimeout((window as any).typingTimeout);
      (window as any).typingTimeout = setTimeout(() => {
        socket.emit('typing:stop', { conversationId: selectedConversation.id });
      }, 1000);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Messages</h1>

        <div className="bg-white rounded-lg shadow overflow-hidden flex" style={{ height: 'calc(100vh - 200px)' }}>
          {/* Conversations List */}
          <div className="w-1/3 border-r border-gray-200 overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {conversations?.map((conv: any) => (
              <div
                key={conv.id}
                onClick={() => setSelectedConversation(conv)}
                className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedConversation?.id === conv.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="font-semibold text-gray-900">
                    {conv.supplierId || conv.restaurantId}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {conv.messages?.[0]?.content || 'Start a conversation'}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white text-xs font-semibold rounded-full mt-2">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Messages Area */}
          <div className="flex-1 flex flex-col">
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedConversation.supplierId}</h3>
                    <p className="text-sm text-gray-500">
                      {isTyping ? 'Typing...' : 'Online'}
                    </p>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages?.map((msg: any) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderId === 'user_123' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-md px-4 py-2 rounded-lg ${
                          msg.senderId === 'user_123'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <p>{msg.content}</p>
                        <p className="text-xs mt-1 opacity-75">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <button className="text-gray-400 hover:text-gray-600">
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      <Image className="h-5 w-5" />
                    </button>
                    <input
                      type="text"
                      value={messageInput}
                      onChange={handleTyping}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Select a conversation to start messaging
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

