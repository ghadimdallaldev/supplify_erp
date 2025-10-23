'use client';

import { generateAllTestData } from '@/lib/test-data-generator';

export function initializeTestData() {
  const testData = generateAllTestData();
  
  // Clear existing test data
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('supplify-user-') || 
        key?.startsWith('supplify-thread-') || 
        key?.startsWith('supplify-message-') ||
        key?.startsWith('supplify-relationship-')) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));

  // Store users
  testData.users.forEach(user => {
    localStorage.setItem(`supplify-user-${user.id}`, JSON.stringify(user));
  });

  // Store relationships
  testData.relationships.forEach(rel => {
    localStorage.setItem(`supplify-relationship-${rel.restaurantId}-${rel.supplierId}`, JSON.stringify(rel));
  });

  // Store chat threads
  testData.chatThreads.forEach(thread => {
    localStorage.setItem(`supplify-thread-${thread.id}`, JSON.stringify(thread));
  });

  // Store chat messages
  testData.chatMessages.forEach(message => {
    localStorage.setItem(`supplify-message-${message.id}`, JSON.stringify(message));
  });

  // Store metadata
  localStorage.setItem('supplify-test-data-initialized', JSON.stringify({
    initializedAt: new Date().toISOString(),
    userCount: testData.users.length,
    relationshipCount: testData.relationships.length,
    threadCount: testData.chatThreads.length,
    messageCount: testData.chatMessages.length,
  }));

  console.log('✅ Test data initialized:', {
    users: testData.users.length,
    relationships: testData.relationships.length,
    chatThreads: testData.chatThreads.length,
    chatMessages: testData.chatMessages.length,
  });

  return testData;
}

export function getTestDataSummary() {
  const metadata = localStorage.getItem('supplify-test-data-initialized');
  if (!metadata) return null;
  
  return JSON.parse(metadata);
}

export function clearTestData() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('supplify-user-') || 
        key?.startsWith('supplify-thread-') || 
        key?.startsWith('supplify-message-') ||
        key?.startsWith('supplify-relationship-') ||
        key === 'supplify-test-data-initialized') {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  
  console.log('🗑️ Test data cleared');
}
