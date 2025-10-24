// Test Data Generator for Supplify Platform
// Creates realistic restaurant and supplier accounts with proper relationships

export interface TestUser {
  id: string;
  email: string;
  password: string;
  name: string;
  firstName: string;
  lastName: string;
  role: 'restaurant' | 'supplier';
  orgId: string;
  orgName: string;
  phone: string;
  businessType: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  createdAt: string;
  status: 'approved';
  tier: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
}

export interface RestaurantSupplierRelationship {
  restaurantId: string;
  supplierId: string;
  status: 'active' | 'pending' | 'inactive';
  establishedDate: string;
}

// Restaurant Data
export const RESTAURANT_DATA = [
  {
    name: "Golden Fork Restaurant",
    businessType: "Fine Dining",
    city: "New York",
    state: "NY",
    zipCode: "10001",
    tier: "PREMIUM" as const,
  },
  {
    name: "Bella Vista Bistro",
    businessType: "Italian Restaurant",
    city: "Los Angeles",
    state: "CA",
    zipCode: "90210",
    tier: "PRO" as const,
  },
  {
    name: "Downtown Bistro",
    businessType: "Casual Dining",
    city: "Chicago",
    state: "IL",
    zipCode: "60601",
    tier: "BASIC" as const,
  },
  {
    name: "Mama Mia Italian",
    businessType: "Family Restaurant",
    city: "Boston",
    state: "MA",
    zipCode: "02101",
    tier: "PRO" as const,
  },
  {
    name: "Sunset Grill",
    businessType: "American Grill",
    city: "Miami",
    state: "FL",
    zipCode: "33101",
    tier: "BASIC" as const,
  },
];

// Supplier Data
export const SUPPLIER_DATA = [
  {
    name: "Fresh Foods Co.",
    businessType: "Fresh Produce Supplier",
    city: "Fresno",
    state: "CA",
    zipCode: "93701",
    tier: "PREMIUM" as const,
  },
  {
    name: "Premium Meats Ltd.",
    businessType: "Meat & Poultry Supplier",
    city: "Omaha",
    state: "NE",
    zipCode: "68101",
    tier: "PRO" as const,
  },
  {
    name: "Ocean Fresh Seafood",
    businessType: "Seafood Supplier",
    city: "Seattle",
    state: "WA",
    zipCode: "98101",
    tier: "PRO" as const,
  },
  {
    name: "Garden Valley Organics",
    businessType: "Organic Produce Supplier",
    city: "Portland",
    state: "OR",
    zipCode: "97201",
    tier: "BASIC" as const,
  },
  {
    name: "Artisan Bakery Supply",
    businessType: "Bakery & Pastry Supplier",
    city: "San Francisco",
    state: "CA",
    zipCode: "94101",
    tier: "BASIC" as const,
  },
];

export function generateTestUsers(): { users: TestUser[], relationships: RestaurantSupplierRelationship[] } {
  const users: TestUser[] = [];
  const relationships: RestaurantSupplierRelationship[] = [];

  // Generate Restaurant Users
  RESTAURANT_DATA.forEach((restaurant, index) => {
    const userId = `restaurant_${index + 1}`;
    const orgId = `org_restaurant_${index + 1}`;
    const email = `restaurant${index + 1}@example.com`;
    
    users.push({
      id: userId,
      email: email,
      password: 'password123', // Same password for all test accounts
      name: restaurant.name,
      firstName: restaurant.name.split(' ')[0],
      lastName: restaurant.name.split(' ').slice(1).join(' ') || 'Restaurant',
      role: 'restaurant',
      orgId: orgId,
      orgName: restaurant.name,
      phone: `+1-555-${String(index + 1).padStart(3, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      businessType: restaurant.businessType,
      address: {
        street: `${Math.floor(Math.random() * 9999) + 1} Main Street`,
        city: restaurant.city,
        state: restaurant.state,
        zipCode: restaurant.zipCode,
        country: 'United States',
      },
      createdAt: new Date().toISOString(),
      status: 'approved',
      tier: restaurant.tier,
    });
  });

  // Generate Supplier Users
  SUPPLIER_DATA.forEach((supplier, index) => {
    const userId = `supplier_${index + 1}`;
    const orgId = `org_supplier_${index + 1}`;
    const email = `supplier${index + 1}@example.com`;
    
    users.push({
      id: userId,
      email: email,
      password: 'password123', // Same password for all test accounts
      name: supplier.name,
      firstName: supplier.name.split(' ')[0],
      lastName: supplier.name.split(' ').slice(1).join(' ') || 'Supplier',
      role: 'supplier',
      orgId: orgId,
      orgName: supplier.name,
      phone: `+1-555-${String(index + 6).padStart(3, '0')}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      businessType: supplier.businessType,
      address: {
        street: `${Math.floor(Math.random() * 9999) + 1} Industrial Blvd`,
        city: supplier.city,
        state: supplier.state,
        zipCode: supplier.zipCode,
        country: 'United States',
      },
      createdAt: new Date().toISOString(),
      status: 'approved',
      tier: supplier.tier,
    });
  });

  // Generate Relationships (each restaurant works with all suppliers)
  RESTAURANT_DATA.forEach((_, restaurantIndex) => {
    SUPPLIER_DATA.forEach((_, supplierIndex) => {
      relationships.push({
        restaurantId: `restaurant_${restaurantIndex + 1}`,
        supplierId: `supplier_${supplierIndex + 1}`,
        status: 'active',
        establishedDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(), // Random date within last year
      });
    });
  });

  return { users, relationships };
}

// Chat Data Structure
export interface ChatThread {
  id: string;
  restaurantId: string;
  supplierId: string;
  restaurantName: string;
  supplierName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  senderRole: 'restaurant' | 'supplier';
  content: string;
  timestamp: string;
  read: boolean;
  messageType: 'text' | 'order_reference' | 'system';
}

export function generateChatData(relationships: RestaurantSupplierRelationship[]): { threads: ChatThread[], messages: ChatMessage[] } {
  const threads: ChatThread[] = [];
  const messages: ChatMessage[] = [];

  relationships.forEach((rel, index) => {
    const threadId = `thread_${rel.restaurantId}_${rel.supplierId}`;
    const restaurantName = RESTAURANT_DATA.find((_, i) => `restaurant_${i + 1}` === rel.restaurantId)?.name || 'Restaurant';
    const supplierName = SUPPLIER_DATA.find((_, i) => `supplier_${i + 1}` === rel.supplierId)?.name || 'Supplier';

    // Create thread
    threads.push({
      id: threadId,
      restaurantId: rel.restaurantId,
      supplierId: rel.supplierId,
      restaurantName,
      supplierName,
      lastMessage: '',
      lastMessageAt: '',
      unreadCount: 0,
      createdAt: rel.establishedDate,
      updatedAt: rel.establishedDate,
    });

    // Generate some sample messages for each thread
    const sampleMessages = [
      { content: "Hello! I'd like to discuss our upcoming order.", senderRole: 'restaurant' as const },
      { content: "Hi! I'd be happy to help with your order. What are you looking for?", senderRole: 'supplier' as const },
      { content: "We need fresh vegetables for next week's menu. Do you have organic options?", senderRole: 'restaurant' as const },
      { content: "Yes, we have a great selection of organic vegetables. I'll send you our current availability.", senderRole: 'supplier' as const },
      { content: "Perfect! Can you also provide pricing for bulk orders?", senderRole: 'restaurant' as const },
    ];

    sampleMessages.forEach((msg, msgIndex) => {
      const messageId = `msg_${threadId}_${msgIndex}`;
      const senderId = msg.senderRole === 'restaurant' ? rel.restaurantId : rel.supplierId;
      const senderName = msg.senderRole === 'restaurant' ? restaurantName : supplierName;
      
      messages.push({
        id: messageId,
        threadId: threadId,
        senderId: senderId,
        senderName: senderName,
        senderRole: msg.senderRole,
        content: msg.content,
        timestamp: new Date(Date.now() - (sampleMessages.length - msgIndex) * 24 * 60 * 60 * 1000).toISOString(),
        read: msgIndex < sampleMessages.length - 1, // Last message is unread
        messageType: 'text',
      });
    });

    // Update thread with last message info
    const lastMessage = sampleMessages[sampleMessages.length - 1];
    threads[threads.length - 1].lastMessage = lastMessage.content;
    threads[threads.length - 1].lastMessageAt = messages[messages.length - 1].timestamp;
    threads[threads.length - 1].unreadCount = 1; // Last message is unread
  });

  return { threads, messages };
}

// Export all data
export function generateAllTestData() {
  const { users, relationships } = generateTestUsers();
  const { threads, messages } = generateChatData(relationships);
  
  return {
    users,
    relationships,
    chatThreads: threads,
    chatMessages: messages,
  };
}
