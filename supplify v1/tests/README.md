# Supplify Test Files

This directory contains all test files, scripts, and utilities for testing the Supplify platform.

## 📁 Test File Organization

### 🧪 System Tests
- **`test-complete-flow-final.js`** - Complete end-to-end platform testing
- **`test-complete-flow.js`** - Basic platform flow testing
- **`test-inventory-system.js`** - Inventory system functionality tests
- **`test-inventory-api-final.js`** - Final inventory API tests
- **`test-inventory-api.js`** - Basic inventory API tests

### 🔧 Feature Tests
- **`test-auto-sync-system.js`** - Auto-sync inventory system tests
- **`test-bulk-upload-system.js`** - Bulk upload functionality tests
- **`test-chat-fixes.js`** - Chat system fixes verification
- **`test-inventory-fixes.js`** - Inventory fixes verification
- **`test-inventory-persistence.js`** - Database persistence tests
- **`test-inventory-update.js`** - Inventory update functionality tests

### 🛠️ Utility Scripts
- **`check-inventory-status.js`** - Inventory status checking utility
- **`create-test-orders.js`** - Test order creation script
- **`create-ui-test-orders.js`** - UI test order creation
- **`fix-revenue-nan-browser.js`** - Browser-based revenue fix
- **`fix-revenue-nan.js`** - Revenue calculation fix

## 🚀 How to Run Tests

### Browser Console Tests
Most test files are designed to run in the browser console:

1. **Open Supplify platform** in your browser
2. **Open Developer Console** (F12)
3. **Copy and paste** the test file content
4. **Run the test** and observe results

### Node.js Tests
Some tests can be run from the command line:

```bash
# Run specific test
node tests/test-inventory-system.js

# Run all tests
for file in tests/*.js; do node "$file"; done
```

## 📋 Test Categories

### ✅ Inventory System Tests
- **Auto-sync functionality** - Tests automatic inventory updates
- **Manual adjustments** - Tests manual stock adjustments
- **Bulk operations** - Tests Excel-based bulk uploads
- **Database persistence** - Tests data persistence across sessions
- **Real-time updates** - Tests live inventory updates

### ✅ Order Management Tests
- **Order creation** - Tests order placement functionality
- **Status transitions** - Tests order status updates
- **Multi-supplier orders** - Tests orders with multiple suppliers
- **Order tracking** - Tests order visibility and tracking

### ✅ Chat System Tests
- **Real-time messaging** - Tests WebSocket-based chat
- **Message persistence** - Tests database message storage
- **Supplier discovery** - Tests supplier list from orders
- **Favorites functionality** - Tests supplier favorites

### ✅ Analytics Tests
- **Revenue calculations** - Tests revenue tracking accuracy
- **Data validation** - Tests analytics data integrity
- **Real-time updates** - Tests live analytics updates
- **Performance metrics** - Tests system performance

## 🔍 Test Results Interpretation

### ✅ Success Indicators
- **Green checkmarks** (✅) - Test passed successfully
- **"Working" messages** - Functionality confirmed
- **No error messages** - System operating correctly
- **Expected data returned** - API responses correct

### ❌ Failure Indicators
- **Red X marks** (❌) - Test failed
- **Error messages** - System issues detected
- **Unexpected data** - API responses incorrect
- **Timeout errors** - Service connectivity issues

## 🛠️ Troubleshooting Tests

### Common Issues

#### Service Not Available
```
Error: Failed to connect to service
```
**Solution**: Ensure all services are running (`pnpm run dev`)

#### Database Connection Issues
```
Error: Database connection failed
```
**Solution**: Check PostgreSQL is running and accessible

#### Authentication Errors
```
Error: Unauthorized access
```
**Solution**: Ensure user is logged in with valid credentials

### Test Environment Setup

#### Prerequisites
- All Supplify services running
- Database properly configured
- User accounts created
- Test data available

#### Environment Variables
```bash
# Required for API tests
ORDERS_SERVICE_URL=http://localhost:3004
INVENTORY_SERVICE_URL=http://localhost:3005
CATALOG_SERVICE_URL=http://localhost:3006
CHAT_SERVICE_URL=http://localhost:3011
```

## 📊 Test Coverage

### Core Features
- ✅ **Order Management** - Complete order lifecycle
- ✅ **Inventory Management** - All inventory operations
- ✅ **Chat System** - Real-time messaging
- ✅ **Analytics** - Revenue and performance tracking
- ✅ **Bulk Operations** - Excel-based uploads
- ✅ **Authentication** - User management and RBAC

### Integration Points
- ✅ **Service Communication** - Inter-service messaging
- ✅ **Database Operations** - Data persistence
- ✅ **Real-time Updates** - WebSocket functionality
- ✅ **File Operations** - Excel processing
- ✅ **API Endpoints** - REST API functionality

## 🎯 Test Execution Strategy

### 1. **Smoke Tests**
Run basic functionality tests to ensure system is operational:
```bash
node tests/test-complete-flow-final.js
```

### 2. **Feature Tests**
Test specific features in detail:
```bash
node tests/test-inventory-system.js
node tests/test-chat-fixes.js
```

### 3. **Integration Tests**
Test system integration points:
```bash
node tests/test-auto-sync-system.js
node tests/test-bulk-upload-system.js
```

### 4. **Regression Tests**
Verify fixes and updates:
```bash
node tests/test-inventory-fixes.js
node tests/test-chat-fixes.js
```

## 📝 Adding New Tests

### Test File Structure
```javascript
// Test script template
console.log('🧪 Testing [Feature Name]...\n');

async function testFeature() {
  try {
    // Test implementation
    console.log('✅ Test passed');
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testFeature().then(() => {
  console.log('\n🎯 Test Summary:');
  console.log('✅ Feature working correctly');
});
```

### Test Best Practices
- **Clear naming** - Use descriptive test names
- **Error handling** - Include proper error handling
- **Result reporting** - Provide clear success/failure indicators
- **Documentation** - Include test purpose and expected results

---

**Test Directory** - Comprehensive testing suite for Supplify platform  
**Last Updated**: October 23, 2025  
**Coverage**: All core features and integrations ✅
