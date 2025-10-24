'use client';

import React, { useState, useEffect } from 'react';
import { NotificationManager } from '@/components/NotificationManager';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const [notificationCount, setNotificationCount] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    if (!isEnabled) return;

    const fetchNotificationCount = async () => {
      try {
        const response = await fetch('/api/chat/notifications/count?unreadOnly=true');
        if (response.ok) {
          const data = await response.json();
          setNotificationCount(data.count);
        }
      } catch (error) {
        console.error('Error fetching notification count:', error);
      }
    };

    // Fetch count immediately
    fetchNotificationCount();

    // Set up polling for real-time updates
    const interval = setInterval(fetchNotificationCount, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isEnabled]);

  const toggleNotifications = () => {
    setIsEnabled(!isEnabled);
  };

  if (!isEnabled) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleNotifications}
        className={className}
        title="Enable notifications"
      >
        <BellOff className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleNotifications}
        className={className}
        title="Disable notifications"
      >
        <Bell className="w-4 h-4" />
        {notificationCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {notificationCount > 99 ? '99+' : notificationCount}
          </Badge>
        )}
      </Button>
    </div>
  );
}

// Main notification system component
export function NotificationSystem() {
  const [isVisible, setIsVisible] = useState(true);

  // Hide notifications if user has disabled them
  useEffect(() => {
    const savedPreference = localStorage.getItem('notifications-enabled');
    if (savedPreference === 'false') {
      setIsVisible(false);
    }
  }, []);

  const toggleVisibility = () => {
    const newVisibility = !isVisible;
    setIsVisible(newVisibility);
    localStorage.setItem('notifications-enabled', newVisibility.toString());
  };

  if (!isVisible) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleVisibility}
          className="bg-white shadow-lg"
        >
          Enable Notifications
        </Button>
      </div>
    );
  }

  return (
    <>
      <NotificationManager 
        maxNotifications={5}
        autoDismissDelay={8000}
        position="top-right"
      />
      
      {/* Notification toggle button */}
      <div className="fixed top-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleVisibility}
          className="bg-white shadow-lg"
        >
          Hide Notifications
        </Button>
      </div>
    </>
  );
}

// Hook for managing notification state
export function useNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/chat/notifications');
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      // Optimistically remove from state
      setNotifications(prev => prev.filter(n => n.id !== notificationId));

      // Mark as read on server
      await fetch(`/api/chat/notifications/${notificationId}/read`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('Error dismissing notification:', error);
      // Re-fetch notifications if server call failed
      fetchNotifications();
    }
  };

  const dismissAllNotifications = async () => {
    try {
      // Optimistically clear all
      setNotifications([]);

      // Mark all as read on server
      await fetch('/api/chat/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mark_all_read',
        }),
      });
    } catch (error) {
      console.error('Error dismissing all notifications:', error);
      // Re-fetch notifications if server call failed
      fetchNotifications();
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  return {
    notifications,
    loading,
    error,
    refetch: fetchNotifications,
    dismissNotification,
    dismissAllNotifications,
  };
}
