# Test Data Management

Supplify includes a comprehensive test data system that creates realistic accounts and relationships for development and testing.

## 🎯 Overview

The test data system creates:
- **5 Restaurant Accounts** with realistic business data
- **5 Supplier Accounts** with diverse product catalogs
- **25 Relationships** (each restaurant ↔ each supplier)
- **25 Chat Threads** with sample conversations
- **Sample Messages** for testing chat functionality

## 🚀 Quick Setup

### Using the Admin Interface
1. **Login as admin** (`admin@supplify.com` / `admin123`)
2. **Navigate to** `/admin/test-data`
3. **Click "Initialize Test Data"**
4. **Wait for success message** with data counts

### Using the API
```bash
# Initialize test data
curl -X POST http://localhost:3000/api/test-data/initialize

# Clear test data
curl -X DELETE http://localhost:3000/api/test-data/clear
```

## 👥 Test Accounts

### Restaurant Accounts
All use password: `password123`

| Email | Name | Tier | Business Type |
|-------|------|------|---------------|
| `restaurant1@example.com` | Golden Fork Restaurant | Premium | Fine Dining |
| `restaurant2@example.com` | Bella Vista Bistro | Pro | Casual Dining |
| `restaurant3@example.com` | Downtown Bistro | Basic | Fast Casual |
| `restaurant4@example.com` | Mama Mia Italian | Pro | Italian Restaurant |
| `restaurant5@example.com` | Sunset Grill | Basic | Family Restaurant |

### Supplier Accounts
All use password: `password123`

| Email | Name | Tier | Specialization |
|-------|------|------|----------------|
| `supplier1@example.com` | Fresh Foods Co. | Premium | Fresh Produce |
| `supplier2@example.com` | Premium Meats Ltd. | Pro | Meat & Poultry |
| `supplier3@example.com` | Ocean Fresh Seafood | Pro | Seafood |
| `supplier4@example.com` | Garden Valley Organics | Basic | Organic Products |
| `supplier5@example.com` | Artisan Bakery Supply | Basic | Bakery Ingredients |

## 🔗 Relationships

Each restaurant has relationships with all 5 suppliers, creating:
- **25 Total Relationships**
- **25 Chat Threads** (one per relationship)
- **Sample Messages** in each thread for testing

## 💬 Chat Threads

Each relationship includes a chat thread with:
- **Initial greeting messages**
- **Sample order discussions**
- **Business inquiries**
- **Realistic conversation flow**

## 🛠️ Managing Test Data

### Admin Interface Features

#### Initialize Test Data
- Creates all accounts and relationships
- Generates sample chat messages
- Sets up realistic business data
- Shows success confirmation with counts

#### Clear Test Data
- Removes all test accounts
- Clears chat threads and messages
- Resets relationship data
- Confirms cleanup completion

#### Data Status Dashboard
- **User Count**: Total test accounts created
- **Relationship Count**: Active supplier-restaurant relationships
- **Thread Count**: Chat threads with messages
- **Message Count**: Total messages across all threads

### Programmatic Management

#### Initialize Data
```typescript
import { initializeTestData } from '@/lib/test-data-manager';

const testData = initializeTestData();
console.log(`Created ${testData.users.length} users`);
```

#### Clear Data
```typescript
import { clearTestData } from '@/lib/test-data-manager';

clearTestData();
console.log('Test data cleared');
```

#### Get Data Summary
```typescript
import { getTestDataSummary } from '@/lib/test-data-manager';

const summary = getTestDataSummary();
console.log(`Users: ${summary.userCount}`);
```

## 🧪 Testing Scenarios

### Chat Testing
1. **Login as restaurant** (`restaurant1@example.com`)
2. **Go to** `/restaurant/chat`
3. **See 5 supplier conversations** with unread counts
4. **Click on a supplier** to open chat
5. **Send messages** and verify real-time updates

### Supplier Testing
1. **Login as supplier** (`supplier1@example.com`)
2. **Go to** `/supplier/dashboard`
3. **See 5 restaurant clients** with unread counts
4. **Click "Chat"** to open conversation
5. **Verify unread badges** update correctly

### Admin Testing
1. **Login as admin** (`admin@supplify.com`)
2. **Go to** `/admin/test-data`
3. **Initialize test data** if not already done
4. **Check data status** shows correct counts
5. **Clear data** to reset for fresh testing

## 🔧 Customization

### Adding New Test Accounts
```typescript
// In test-data-generator.ts
const newRestaurant = {
  id: `restaurant_${Date.now()}`,
  email: 'newrestaurant@example.com',
  name: 'New Restaurant',
  role: 'restaurant',
  // ... other properties
};
```

### Modifying Sample Messages
```typescript
// In test-data-generator.ts
const sampleMessages = [
  'Hello! I\'m interested in your fresh produce.',
  'What are your delivery times?',
  'Do you have organic options available?',
  // Add your own messages
];
```

### Customizing Relationships
```typescript
// In test-data-generator.ts
const createRelationships = (restaurants, suppliers) => {
  // Customize which restaurants connect to which suppliers
  // Default: all restaurants ↔ all suppliers
};
```

## 🚨 Troubleshooting

### Common Issues

#### Test Data Not Initializing
- **Check admin permissions** - must be logged in as admin
- **Verify localStorage** - ensure browser supports localStorage
- **Check console errors** - look for JavaScript errors

#### Chat Not Working
- **Verify relationships** - ensure test data was initialized
- **Check user accounts** - confirm accounts exist in localStorage
- **Test chat service** - verify chat-service.ts is working

#### Missing Accounts
- **Re-initialize data** - clear and recreate test data
- **Check email format** - ensure emails are valid
- **Verify passwords** - all use `password123`

### Data Persistence

Test data is stored in:
- **localStorage** - Browser-based storage
- **Key format**: `supplify-user-{id}`, `supplify-thread-{id}`, etc.
- **Persistence**: Survives browser restarts
- **Clearing**: Use admin interface or clear localStorage

## 📊 Data Structure

### User Object
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'restaurant' | 'supplier' | 'admin';
  orgId: string;
  orgName: string;
  tier: 'FREE' | 'BASIC' | 'PRO' | 'PREMIUM';
  status: 'pending_approval' | 'approved' | 'suspended' | 'rejected';
  // ... other properties
}
```

### Chat Thread Object
```typescript
interface ChatThread {
  id: string;
  restaurantId: string;
  supplierId: string;
  restaurantName: string;
  supplierName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  // ... other properties
}
```

## 🎉 Best Practices

1. **Initialize test data** before starting development
2. **Use consistent passwords** (`password123`) for all test accounts
3. **Clear data regularly** to avoid conflicts
4. **Test chat functionality** with multiple accounts
5. **Verify relationships** work correctly
6. **Check unread counts** update properly

Happy testing! 🚀
