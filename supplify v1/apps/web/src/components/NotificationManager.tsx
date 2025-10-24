'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { useAuthContext } from '@/app/auth-provider';

interface ChatNotification {
  id: string;
  threadId: string;
  messageId?: string;
  type: 'MESSAGE' | 'TYPING' | 'READ_RECEIPT' | 'THREAD_CREATED';
  title: string;
  body: string;
  senderName?: string;
  senderRole?: string;
  createdAt: Date;
  readAt?: Date;
  data?: any;
}

interface NotificationManagerProps {
  maxNotifications?: number;
  autoDismissDelay?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function NotificationManager({ 
  maxNotifications = 5, 
  autoDismissDelay = 5000,
  position = 'top-right'
}: NotificationManagerProps) {
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<ChatNotification[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  // Load notifications on mount
  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map(notification => {
      if (notification.readAt) return null; // Already dismissed

      return setTimeout(() => {
        dismissNotification(notification.id);
      }, autoDismissDelay);
    });

    return () => {
      timers.forEach(timer => timer && clearTimeout(timer));
    };
  }, [notifications, autoDismissDelay]);

  const loadNotifications = async () => {
    try {
      const response = await fetch('/api/chat/notifications');
      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }

      const data = await response.json();
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      // Optimistically remove from UI
      setNotifications(prev => prev.filter(n => n.id !== notificationId));

      // Mark as read on server
      await fetch(`/api/chat/notifications/${notificationId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error dismissing notification:', error);
      // Re-add notification if server call failed
      loadNotifications();
    }
  };

  const dismissAllNotifications = async () => {
    try {
      // Optimistically clear all
      const notificationIds = notifications.map(n => n.id);
      setNotifications([]);

      // Mark all as read on server
      await Promise.all(
        notificationIds.map(id =>
          fetch(`/api/chat/notifications/${id}/read`, {
            method: 'POST',
          })
        )
      );
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
      // Reload notifications if server call failed
      loadNotifications();
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, readAt: new Date() } : n
        )
      );

      await fetch(`/api/chat/notifications/${notificationId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleNotificationClick = (notification: ChatNotification) => {
    // Mark as read
    markAsRead(notification.id);
    
    // Navigate to chat thread
    if (notification.threadId) {
      window.location.href = `/chat/${notification.threadId}`;
    }
  };

  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      default:
        return 'top-4 right-4';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'MESSAGE':
        return <MessageSquare className="w-4 h-4 text-blue-600" />;
      case 'TYPING':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case 'READ_RECEIPT':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <MessageSquare className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);

    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${Math.floor(diffInMinutes)}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (!isVisible || notifications.length === 0) {
    return null;
  }

  return (
    <div className={`fixed ${getPositionClasses()} z-50 space-y-2 max-w-sm`}>
      {/* Header with dismiss all */}
      {notifications.length > 1 && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {notifications.length} notifications
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissAllNotifications}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Dismiss all
          </Button>
        </div>
      )}

      {/* Notifications */}
      {notifications.slice(0, maxNotifications).map((notification, index) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          index={index}
          onDismiss={() => dismissNotification(notification.id)}
          onClick={() => handleNotificationClick(notification)}
          getIcon={getNotificationIcon}
          formatTime={formatTime}
        />
      ))}

      {/* Show more indicator */}
      {notifications.length > maxNotifications && (
        <div className="text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.href = '/notifications'}
            className="text-xs"
          >
            View {notifications.length - maxNotifications} more
          </Button>
        </div>
      )}
    </div>
  );
}

// Individual Notification Card Component
interface NotificationCardProps {
  notification: ChatNotification;
  index: number;
  onDismiss: () => void;
  onClick: () => void;
  getIcon: (type: string) => React.ReactNode;
  formatTime: (date: Date) => string;
}

function NotificationCard({
  notification,
  index,
  onDismiss,
  onClick,
  getIcon,
  formatTime,
}: NotificationCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissing(true);
    
    // Add animation delay before actually dismissing
    setTimeout(() => {
      onDismiss();
    }, 150);
  };

  const handleClick = () => {
    if (!isDismissing) {
      onClick();
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 transform hover:scale-105 hover:shadow-lg ${
        isDismissing ? 'animate-slide-out-right opacity-0' : 'animate-slide-in-right'
      } ${notification.readAt ? 'opacity-60' : 'opacity-100'}`}
      style={{
        animationDelay: `${index * 100}ms`,
        zIndex: 1000 - index,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-0.5">
              {getIcon(notification.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-semibold text-gray-900 truncate">
                  {notification.title}
                </h4>
                {notification.senderRole && (
                  <Badge variant="outline" className="text-xs">
                    {notification.senderRole}
                  </Badge>
                )}
              </div>
              
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                {notification.body}
              </p>
              
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-500">
                  {formatTime(notification.createdAt)}
                </span>
                
                {!notification.readAt && (
                  <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                )}
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className={`flex-shrink-0 ml-2 opacity-0 transition-opacity ${
              isHovered ? 'opacity-100' : ''
            } hover:bg-red-100 hover:text-red-600`}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Notification API Routes
export async function GET_NOTIFICATIONS() {
  try {
    // Mock notifications for now - in production, this would come from database
    const mockNotifications: ChatNotification[] = [
      {
        id: 'notif_1',
        threadId: 'thread_1',
        messageId: 'msg_1',
        type: 'MESSAGE',
        title: 'New message from Fresh Foods Supply',
        body: 'Perfect! We have a great selection of organic vegetables available. What would you like to order?',
        senderName: 'Fresh Foods Supply',
        senderRole: 'SUPPLIER',
        createdAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      },
      {
        id: 'notif_2',
        threadId: 'thread_2',
        messageId: 'msg_2',
        type: 'MESSAGE',
        title: 'New message from Premium Meats Co.',
        body: 'Great! We have excellent cuts available. What specific cuts are you looking for?',
        senderName: 'Premium Meats Co.',
        senderRole: 'SUPPLIER',
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
      },
    ];

    return Response.json(mockNotifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return Response.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function MARK_NOTIFICATION_READ(notificationId: string) {
  try {
    // In production, this would update the database
    console.log(`Marking notification ${notificationId} as read`);
    
    return Response.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return Response.json({ error: 'Failed to mark notification as read' }, { status: 500 });
  }
}

// CSS for animations
const notificationStyles = `
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slide-out-right {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s ease-out;
}

.animate-slide-out-right {
  animation: slide-out-right 0.15s ease-in;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = notificationStyles;
  document.head.appendChild(styleSheet);
}
