'use client';

import React, { useState, useEffect } from 'react';
import { useChat } from './ChatProvider';
import { useAuthContext } from '../app/auth-provider';
import Link from 'next/link';

interface Notification {
  id: string;
  senderName: string;
  message: string;
  conversationId: string;
  senderRole: 'restaurant' | 'supplier';
}

export const ChatNotification: React.FC = () => {
  const { messages } = useChat();
  const { user } = useAuthContext();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user) return;

    const currentUserId = user.orgId;
    const currentRole = user.role;
    const newNotifications: Notification[] = [];

    for (const convId in messages) {
      const conversation = messages[convId];
      const unreadMessages = conversation.filter(
        (msg) => msg.senderId !== currentUserId && !msg.read
      );

      if (unreadMessages.length > 0) {
        const latestUnread = unreadMessages[unreadMessages.length - 1];
        const senderName =
          latestUnread.senderRole === 'restaurant'
            ? getRestaurantName(latestUnread.senderId)
            : getSupplierName(latestUnread.senderId);

        // Check if this notification already exists to avoid duplicates
        if (!notifications.some(n => n.id === latestUnread.id)) {
          newNotifications.push({
            id: latestUnread.id,
            senderName: senderName,
            message: latestUnread.text,
            conversationId: latestUnread.conversationId,
            senderRole: latestUnread.senderRole,
          });
        }
      }
    }

    if (newNotifications.length > 0) {
      setNotifications((prev) => [...prev, ...newNotifications]);
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setNotifications([]); // Clear notifications after they disappear
      }, 5000); // Notification visible for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [messages, user, notifications]);

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

  const handleCloseNotification = (notificationId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    
    // If no notifications left, hide the container
    if (notifications.length === 1) {
      setVisible(false);
    }
  };

  if (!visible || notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {notifications.map((notification) => (
        <Link
          key={notification.id}
          href={
            user?.role === 'restaurant'
              ? `/restaurant/chat?supplier=${notification.conversationId}`
              : `/supplier/chat?restaurant=${notification.conversationId}`
          }
          className="block bg-white border border-gray-200 rounded-lg shadow-lg p-4 pr-10 relative
                     transform transition-transform duration-300 hover:scale-105 cursor-pointer"
          onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
        >
          <div className="font-semibold text-gray-900">New message from {notification.senderName}</div>
          <p className="text-sm text-gray-600 truncate max-w-xs">{notification.message}</p>
          <button
            onClick={(e) => handleCloseNotification(notification.id, e)}
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 z-10"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </Link>
      ))}
    </div>
  );
};