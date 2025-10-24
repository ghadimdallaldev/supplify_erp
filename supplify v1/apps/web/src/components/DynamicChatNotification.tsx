'use client';

import React from 'react';
import { useAuthContext } from '../app/auth-provider';
import { ChatNotification } from './ChatNotification';

export const DynamicChatNotification: React.FC = () => {
  const { user, loading } = useAuthContext();

  if (loading || !user) {
    return null; // Don't render notification until user is loaded
  }

  return <ChatNotification />;
};