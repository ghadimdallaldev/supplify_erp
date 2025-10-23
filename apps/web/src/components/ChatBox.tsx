'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Send, 
  Paperclip, 
  Smile, 
  MoreVertical, 
  Phone, 
  Video, 
  Search,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Reply,
  Edit,
  Trash2,
  Download
} from 'lucide-react';
import { useAuthContext } from '@/app/auth-provider';
import { FlagGate } from '@/hooks/useFeatureFlags';

interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: string;
  senderName?: string;
  body: string;
  messageType: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM';
  attachments: string[];
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  replyToId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatThread {
  id: string;
  scope: 'ORDER' | 'ORG' | 'SUPPORT';
  orderId?: string;
  participants: string[];
  title?: string;
  description?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'CLOSED';
  lastMessageAt?: Date;
}

interface TypingIndicator {
  userId: string;
  userName?: string;
  isTyping: boolean;
  lastSeen: Date;
}

interface ChatBoxProps {
  threadId: string;
  thread?: ChatThread;
  onThreadUpdate?: (thread: ChatThread) => void;
}

export function ChatBox({ threadId, thread, onThreadUpdate }: ChatBoxProps) {
  const { user } = useAuthContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingIndicators, setTypingIndicators] = useState<TypingIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  // Scroll to bottom when new messages arrive
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load messages
  useEffect(() => {
    loadMessages();
  }, [threadId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/chat/threads/${threadId}/messages`);
      if (!response.ok) {
        throw new Error('Failed to load messages');
      }

      const data = await response.json();
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
      setError(error instanceof Error ? error.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    try {
      const messageData = {
        threadId,
        senderId: user.id,
        senderRole: user.role.toUpperCase(),
        senderName: user.name,
        body: newMessage.trim(),
        replyToId: replyingTo?.id,
      };

      const response = await fetch(`/api/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const newMsg = await response.json();
      setMessages(prev => [newMsg, ...prev]);
      setNewMessage('');
      setReplyingTo(null);
      setEditingMessage(null);

      // Mark as typing false
      await setTypingStatus(false);

    } catch (error) {
      console.error('Error sending message:', error);
      setError(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  // Handle typing
  const handleTyping = useCallback(async (isTyping: boolean) => {
    if (!user) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (isTyping) {
      await setTypingStatus(true);
      
      // Auto-stop typing after 3 seconds
      typingTimeoutRef.current = setTimeout(() => {
        setTypingStatus(false);
      }, 3000);
    } else {
      await setTypingStatus(false);
    }
  }, [user]);

  const setTypingStatus = async (isTyping: boolean) => {
    if (!user) return;

    try {
      await fetch(`/api/chat/threads/${threadId}/typing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          userName: user.name,
          isTyping,
        }),
      });
    } catch (error) {
      console.error('Error setting typing status:', error);
    }
  };

  // Handle input change
  const handleInputChange = (value: string) => {
    setNewMessage(value);
    
    if (value.trim()) {
      handleTyping(true);
    } else {
      handleTyping(false);
    }
  };

  // Handle key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Mark message as read
  const markAsRead = async (messageId: string) => {
    try {
      await fetch(`/api/chat/messages/${messageId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  // Edit message
  const editMessage = async (messageId: string, newBody: string) => {
    try {
      const response = await fetch(`/api/chat/messages/${messageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: newBody }),
      });

      if (!response.ok) {
        throw new Error('Failed to edit message');
      }

      const updatedMessage = await response.json();
      setMessages(prev => prev.map(msg => 
        msg.id === messageId ? updatedMessage : msg
      ));
      setEditingMessage(null);
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  // Delete message
  const deleteMessage = async (messageId: string) => {
    try {
      const response = await fetch(`/api/chat/messages/${messageId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete message');
      }

      setMessages(prev => prev.filter(msg => msg.id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  // Get message status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SENT':
        return <Check className="w-3 h-3 text-gray-400" />;
      case 'DELIVERED':
        return <CheckCheck className="w-3 h-3 text-gray-400" />;
      case 'READ':
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      case 'FAILED':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  // Format message time
  const formatMessageTime = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffInHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24) {
      return messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return messageDate.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">{error}</p>
          <Button onClick={loadMessages} className="mt-2">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <FlagGate flag="chat_enabled" fallback={<div className="text-center p-8 text-gray-500">Chat is disabled</div>}>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {thread?.title || 'Chat'}
              </CardTitle>
              {thread?.description && (
                <p className="text-sm text-gray-600">{thread.description}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Phone className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm">
                <Video className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOwn={message.senderId === user?.id}
                onReply={() => setReplyingTo(message)}
                onEdit={() => setEditingMessage(message)}
                onDelete={() => deleteMessage(message.id)}
                onMarkAsRead={() => markAsRead(message.id)}
                getStatusIcon={getStatusIcon}
                formatTime={formatMessageTime}
              />
            ))}
            
            {/* Typing indicators */}
            {typingIndicators.length > 0 && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span>
                  {typingIndicators.map(indicator => indicator.userName).join(', ')} 
                  {typingIndicators.length === 1 ? ' is' : ' are'} typing...
                </span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Reply indicator */}
          {replyingTo && (
            <div className="border-t p-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Reply className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    Replying to {replyingTo.senderName}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                >
                  ×
                </Button>
              </div>
              <p className="text-sm text-gray-500 truncate ml-6">
                {replyingTo.body}
              </p>
            </div>
          )}

          {/* Message input */}
          <div className="border-t p-4">
            <div className="flex items-center space-x-2">
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="pr-20"
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Smile className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <Button onClick={sendMessage} disabled={!newMessage.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </FlagGate>
  );
}

// Message Bubble Component
interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMarkAsRead: () => void;
  getStatusIcon: (status: string) => React.ReactNode;
  formatTime: (date: Date) => string;
}

function MessageBubble({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onMarkAsRead,
  getStatusIcon,
  formatTime,
}: MessageBubbleProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);

  const handleEdit = () => {
    setIsEditing(true);
    setEditText(message.body);
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== message.body) {
      // Call edit function here
      console.log('Editing message:', message.id, editText);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(message.body);
  };

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} group`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className={`max-w-xs lg:max-w-md ${isOwn ? 'order-2' : 'order-1'}`}>
        <div
          className={`px-4 py-2 rounded-lg ${
            isOwn
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="text-sm"
                autoFocus
              />
              <div className="flex justify-end space-x-2">
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm">{message.body}</p>
              
              {/* Attachments */}
              {message.attachments.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Download className="w-3 h-3" />
                      <span className="text-xs underline">
                        {attachment.split('/').pop()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className={`flex items-center space-x-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
          <span className="text-xs text-gray-500">
            {formatTime(message.createdAt)}
          </span>
          {isOwn && getStatusIcon(message.status)}
        </div>
      </div>

      {/* Message actions */}
      {showActions && !isEditing && (
        <div className={`flex items-center space-x-1 ${isOwn ? 'order-1 mr-2' : 'order-2 ml-2'}`}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onReply}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Reply className="w-3 h-3" />
          </Button>
          {isOwn && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Chat Thread List Component
interface ChatThreadListProps {
  threads: ChatThread[];
  selectedThreadId?: string;
  onThreadSelect: (thread: ChatThread) => void;
}

export function ChatThreadList({ threads, selectedThreadId, onThreadSelect }: ChatThreadListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredThreads = threads.filter(thread =>
    thread.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 border-r flex flex-col">
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredThreads.map((thread) => (
          <div
            key={thread.id}
            className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
              selectedThreadId === thread.id ? 'bg-blue-50 border-blue-200' : ''
            }`}
            onClick={() => onThreadSelect(thread)}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {thread.title || 'Untitled Chat'}
                </h3>
                {thread.description && (
                  <p className="text-xs text-gray-500 truncate">
                    {thread.description}
                  </p>
                )}
                <div className="flex items-center space-x-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {thread.scope}
                  </Badge>
                  {thread.orderId && (
                    <Badge variant="secondary" className="text-xs">
                      Order #{thread.orderId}
                    </Badge>
                  )}
                </div>
              </div>
              {thread.lastMessageAt && (
                <span className="text-xs text-gray-500">
                  {new Date(thread.lastMessageAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
