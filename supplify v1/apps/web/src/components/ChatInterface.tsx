'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Send, 
  Search,
  Star,
  StarOff,
  MessageCircle,
  Users,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  Heart,
  HeartOff
} from 'lucide-react';
import { useChat } from './ChatProvider';
import { useAuthContext } from '@/app/auth-provider';

interface ChatSidebarProps {
  selectedSupplierId?: string;
  onSupplierSelect: (supplierId: string) => void;
}

export function ChatSidebar({ selectedSupplierId, onSupplierSelect }: ChatSidebarProps) {
  const { suppliers, messages, onlineStatus, getUnreadCount, toggleSupplierFavorite } = useChat();
  const { user } = useAuthContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         supplier.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = showFavoritesOnly ? supplier.isFavorite : true;
    return matchesSearch && matchesFavorites;
  });

  const sortedSuppliers = [...filteredSuppliers].sort((a, b) => {
    // Favorites first
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    
    // Then by unread count
    const aUnread = getUnreadCount(a.id, user?.id || '');
    const bUnread = getUnreadCount(b.id, user?.id || '');
    if (aUnread !== bUnread) return bUnread - aUnread;
    
    // Finally by name
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="w-80 border-r flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
          <div className="flex items-center space-x-2">
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            >
              {showFavoritesOnly ? <Heart className="w-4 h-4" /> : <HeartOff className="w-4 h-4" />}
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search suppliers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Suppliers List */}
      <div className="flex-1 overflow-y-auto">
        {sortedSuppliers.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm">
              {showFavoritesOnly ? 'No favorite suppliers' : 'No suppliers found'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {showFavoritesOnly 
                ? 'Add suppliers to favorites to see them here' 
                : 'Suppliers will appear here when you place orders'
              }
            </p>
          </div>
        ) : (
          <div className="p-2">
            {sortedSuppliers.map((supplier) => {
              const unreadCount = getUnreadCount(supplier.id, user?.id || '');
              const isOnline = onlineStatus[supplier.id];
              const isSelected = selectedSupplierId === supplier.id;
              const conversation = messages[supplier.id] || [];
              const lastMessage = conversation[conversation.length - 1];

              return (
                <div
                  key={supplier.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
                    isSelected 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'hover:bg-gray-50 border border-transparent'
                  }`}
                  onClick={() => onSupplierSelect(supplier.id)}
                >
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-blue-100 text-blue-600">
                          {supplier.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {supplier.name}
                        </h3>
                        <div className="flex items-center space-x-1">
                          {supplier.isFavorite && (
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          )}
                          {unreadCount > 0 && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                              {unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {lastMessage && (
                        <p className="text-xs text-gray-500 truncate mt-1">
                          {lastMessage.text}
                        </p>
                      )}
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {lastMessage ? lastMessage.timestamp : 'No messages'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSupplierFavorite(supplier.id);
                          }}
                        >
                          {supplier.isFavorite ? (
                            <Star className="w-3 h-3 text-yellow-500 fill-current" />
                          ) : (
                            <StarOff className="w-3 h-3 text-gray-400" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-gray-50">
        <div className="text-xs text-gray-500 text-center">
          <p>💬 Real-time messaging with your suppliers</p>
          <p className="mt-1">Suppliers appear when you place orders</p>
        </div>
      </div>
    </div>
  );
}

interface ChatWindowProps {
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    email: string;
    isFavorite: boolean;
  };
}

export function ChatWindow({ supplierId, supplier }: ChatWindowProps) {
  const { messages, sendMessage, markMessagesAsRead, onlineStatus } = useChat();
  const { user } = useAuthContext();
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const conversation = messages[supplierId] || [];
  const isOnline = onlineStatus[supplierId];

  useEffect(() => {
    // Mark messages as read when conversation is opened
    if (conversation.length > 0) {
      markMessagesAsRead(supplierId, user?.id || '');
    }
  }, [supplierId, conversation.length, markMessagesAsRead, user?.id]);

  const handleSendMessage = () => {
    if (!newMessage.trim() || !user) return;

    sendMessage(
      user.id,
      'restaurant',
      supplierId,
      newMessage.trim()
    );
    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-blue-100 text-blue-600">
                  {supplier.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {isOnline && (
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{supplier.name}</h3>
              <p className="text-sm text-gray-500">
                {isOnline ? 'Online' : 'Offline'} • {supplier.email}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {supplier.isFavorite && (
              <Badge variant="secondary" className="text-xs">
                <Star className="w-3 h-3 mr-1" />
                Favorite
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Start a conversation with {supplier.name}
            </p>
          </div>
        ) : (
          conversation.map((message) => {
            const isOwn = message.senderId === user?.id;
            return (
              <div
                key={message.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      isOwn
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                  </div>
                  <div className={`flex items-center space-x-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-xs text-gray-500">
                      {message.timestamp}
                    </span>
                    {isOwn && (
                      <div className="flex items-center">
                        {message.read ? (
                          <CheckCheck className="w-3 h-3 text-blue-500" />
                        ) : (
                          <Check className="w-3 h-3 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing indicator */}
        {isTyping && (
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            </div>
            <span>{supplier.name} is typing...</span>
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="border-t p-4">
        <div className="flex items-center space-x-2">
          <div className="flex-1">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Message ${supplier.name}...`}
              className="pr-20"
            />
          </div>
          <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChatInterface() {
  const { suppliers } = useChat();
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  const selectedSupplier = selectedSupplierId 
    ? suppliers.find(s => s.id === selectedSupplierId)
    : null;

  useEffect(() => {
    // Auto-select first supplier if available
    if (suppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  return (
    <div className="h-full flex">
      <ChatSidebar
        selectedSupplierId={selectedSupplierId || undefined}
        onSupplierSelect={setSelectedSupplierId}
      />
      {selectedSupplier ? (
        <ChatWindow
          supplierId={selectedSupplierId!}
          supplier={selectedSupplier}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center text-gray-500">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm">Select a supplier to start chatting</p>
            <p className="text-xs text-gray-400 mt-1">
              Suppliers will appear here when you place orders
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
