'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, MessageSquare, Bell, UserPlus, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Notification {
  id: string;
  type: 'chat' | 'signup';
  title: string;
  message: string;
  sender?: string;
  userData?: any;
  timestamp: Date;
  read: boolean;
  status?: 'pending' | 'approved' | 'rejected';
}

// Simple notification store
class SimpleNotificationStore {
  private notifications: Notification[] = [];
  private listeners: (() => void)[] = [];

  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  addNotification(notification: Notification): void {
    // Remove duplicates
    this.notifications = this.notifications.filter(n => 
      !(n.type === notification.type && 
        n.title === notification.title && 
        n.message === notification.message)
    );

    // Add new notification
    this.notifications.unshift(notification);
    
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, 4000);
    
    this.notifyListeners();
  }

  dismissNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  dismissAll(): void {
    this.notifications = [];
    this.notifyListeners();
  }

  markAsRead(id: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.notifyListeners();
    }
  }

  updateNotificationStatus(id: string, status: 'approved' | 'rejected'): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.status = status;
      notification.read = true;
      this.notifyListeners();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }
}

// Global notification store
const notificationStore = new SimpleNotificationStore();

// Export functions
export function addChatNotification(sender: string, message: string) {
  const notification: Notification = {
    id: `chat_${Date.now()}_${Math.random()}`,
    type: 'chat',
    title: `New message from ${sender}`,
    message: message,
    sender: sender,
    timestamp: new Date(),
    read: false,
  };

  notificationStore.addNotification(notification);
}

export function addSignupNotification(userData: any) {
  const notification: Notification = {
    id: `signup_${userData.id}_${Date.now()}`,
    type: 'signup',
    title: `New ${userData.role} signup`,
    message: `${userData.name} from ${userData.organizationName} has requested access`,
    userData: userData,
    timestamp: new Date(),
    read: false,
    status: 'pending',
  };

  notificationStore.addNotification(notification);
}

export function SimpleNotificationManager() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      setNotifications(notificationStore.getNotifications());
    });

    setNotifications(notificationStore.getNotifications());

    return unsubscribe;
  }, []);

  const dismissNotification = (id: string) => {
    notificationStore.dismissNotification(id);
  };

  const dismissAll = () => {
    notificationStore.dismissAll();
  };

  const markAsRead = (id: string) => {
    notificationStore.markAsRead(id);
  };

  const approveUser = (id: string) => {
    const notification = notifications.find(n => n.id === id);
    if (notification && notification.userData) {
      const userKey = `supplify-user-${notification.userData.id}`;
      const userData = JSON.parse(localStorage.getItem(userKey) || '{}');
      userData.status = 'approved';
      localStorage.setItem(userKey, JSON.stringify(userData));
      
      notificationStore.updateNotificationStatus(id, 'approved');
    }
  };

  const rejectUser = (id: string) => {
    const notification = notifications.find(n => n.id === id);
    if (notification && notification.userData) {
      const userKey = `supplify-user-${notification.userData.id}`;
      const userData = JSON.parse(localStorage.getItem(userKey) || '{}');
      userData.status = 'rejected';
      localStorage.setItem(userKey, JSON.stringify(userData));
      
      notificationStore.updateNotificationStatus(id, 'rejected');
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

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (!isVisible || notifications.length === 0) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(true)}
          className="bg-white shadow-lg"
        >
          <Bell className="w-4 h-4 mr-2" />
          Notifications ({notifications.length})
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {notifications.length} notifications
        </span>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={dismissAll}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Dismiss all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Hide
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {notifications.map((notification, index) => (
        <Card
          key={notification.id}
          className={`transition-all duration-200 transform hover:scale-105 hover:shadow-lg ${
            notification.read ? 'opacity-60' : 'opacity-100'
          }`}
          style={{
            animationDelay: `${index * 100}ms`,
            zIndex: 1000 - index,
          }}
          onClick={() => markAsRead(notification.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start space-x-3 flex-1 min-w-0">
                <div className="flex-shrink-0 mt-1">
                  {notification.type === 'chat' ? (
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                  ) : (
                    <UserPlus className="w-5 h-5 text-green-600" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Title with status */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900 leading-tight">
                      {notification.title}
                    </h4>
                    <div className="flex items-center space-x-2">
                      {notification.status && getStatusIcon(notification.status)}
                      {notification.status && (
                        <Badge className={`text-xs ${getStatusColor(notification.status)}`}>
                          {notification.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* Message */}
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {notification.message}
                  </p>
                  
                  {/* User details for signup notifications */}
                  {notification.type === 'signup' && notification.userData && (
                    <div className="text-xs text-gray-500 space-y-1">
                      <div><strong>Name:</strong> {notification.userData.name}</div>
                      <div><strong>Email:</strong> {notification.userData.email}</div>
                      <div><strong>Organization:</strong> {notification.userData.organizationName}</div>
                      <div><strong>Business Type:</strong> {notification.userData.businessType}</div>
                      <div><strong>Phone:</strong> {notification.userData.phone}</div>
                    </div>
                  )}
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-gray-500 font-medium">
                      {formatTime(notification.timestamp)}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      {notification.type === 'chat' ? notification.sender : notification.userData?.role}
                    </span>
                  </div>

                  {/* Action buttons for signup notifications */}
                  {notification.type === 'signup' && notification.status === 'pending' && (
                    <div className="flex items-center space-x-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => approveUser(notification.id)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectUser(notification.id)}
                        className="border-red-300 text-red-600 hover:bg-red-50 text-xs px-3 py-1"
                      >
                        <XCircle className="w-3 h-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dismiss button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNotification(notification.id);
                }}
                className="flex-shrink-0 hover:bg-red-100 hover:text-red-600 p-1"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Notification Bell Component
export function SimpleNotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      setNotifications(notificationStore.getNotifications());
    });

    setNotifications(notificationStore.getNotifications());

    return unsubscribe;
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        title={`${unreadCount} unread notifications`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}
