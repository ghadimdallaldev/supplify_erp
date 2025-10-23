'use client';

import { useAuthContext } from '@/app/auth-provider';
import { SimpleNotificationBell } from '@/components/SimpleNotificationManager';

export function AdminNotifications() {
  const { user } = useAuthContext();
  
  // Only show notifications for admin users
  if (user?.role !== 'admin') {
    return null;
  }
  
  return <SimpleNotificationBell />;
}
