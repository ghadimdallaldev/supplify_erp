import 'dotenv/config';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:4000';

// Test configuration
const testConfig = {
  supplierEmail: 'supplier@example.com',
  supplierPassword: 'password123',
};

let authCookies = '';

// Helper function to make authenticated requests
async function apiRequest(method, endpoint, data = null) {
  const config = {
    method,
    url: `${API_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (authCookies) {
    config.headers['Cookie'] = authCookies;
  }

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status || 500 
    };
  }
}

// Test results
const results = {
  passed: [],
  failed: [],
};

function logResult(testName, passed, details = '') {
  if (passed) {
    results.passed.push(testName);
    console.log(`✓ ${testName}`);
  } else {
    results.failed.push({ test: testName, details });
    console.log(`✗ ${testName}`);
    if (details) console.log(`  ${details}`);
  }
}

// Tests
async function runTests() {
  console.log('🚀 Starting E2E Tests for Supplify\n');

  // Test 1: Health Check
  console.log('1. Testing API Health Check...');
  const healthCheck = await apiRequest('GET', '/health');
  logResult('API Health Check', healthCheck.success && healthCheck.status === 200);

  // Test 2: Get Products
  console.log('2. Testing Get Products...');
  const products = await apiRequest('GET', '/api/products');
  logResult('Get Products', products.success, 
    products.success ? `Found ${products.data?.products?.length || 0} products` : JSON.stringify(products.error));

  // Test 3: Get Inventory
  console.log('3. Testing Get Inventory (requires auth)...');
  const inventory = await apiRequest('GET', '/api/inventory');
  logResult('Get Inventory', inventory.success, 
    inventory.success ? `Found ${inventory.data?.inventory?.length || 0} items` : JSON.stringify(inventory.error));

  // Test 4: Get Warehouses
  console.log('4. Testing Get Warehouses...');
  const warehouses = await apiRequest('GET', '/api/warehouses');
  logResult('Get Warehouses', warehouses.success, 
    warehouses.success ? `Found ${warehouses.data?.warehouses?.length || 0} warehouses` : JSON.stringify(warehouses.error));

  // Test 5: Get Orders
  console.log('5. Testing Get Orders...');
  const orders = await apiRequest('GET', '/api/orders');
  logResult('Get Orders', orders.success, 
    orders.success ? `Found ${orders.data?.orders?.length || 0} orders` : JSON.stringify(orders.error));

  // Test 6: Get Chat Conversations
  console.log('6. Testing Get Chat Conversations...');
  const conversations = await apiRequest('GET', '/api/chat/conversations');
  logResult('Get Chat Conversations', conversations.success, 
    conversations.success ? `Found ${conversations.data?.conversations?.length || 0} conversations` : JSON.stringify(conversations.error));

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${results.passed.length + results.failed.length}`);
  console.log(`✓ Passed: ${results.passed.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed Tests:');
    results.failed.forEach(f => {
      console.log(`  - ${f.test}`);
      if (f.details) console.log(`    ${f.details}`);
    });
  }

  if (results.passed.length > 0) {
    console.log('\n✓ Passed Tests:');
    results.passed.forEach(test => console.log(`  - ${test}`));
  }

  console.log('='.repeat(50));

  // Exit with appropriate code
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Fatal error running tests:', error);
  process.exit(1);
});
