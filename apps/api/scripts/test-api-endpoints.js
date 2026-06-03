import 'dotenv/config';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:4000';

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

async function apiRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (data) {
      config.data = data;
    }

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

async function runTests() {
  console.log('🧪 Testing Supplify API Endpoints\n');

  // Test 1: Health Check
  console.log('1. Testing GET /health...');
  const healthCheck = await apiRequest('GET', '/health');
  logResult('GET /health', healthCheck.success && healthCheck.status === 200);

  // Test 2: Get Products (Public)
  console.log('2. Testing GET /api/products...');
  const products = await apiRequest('GET', '/api/products');
  const productsCount = products.data?.products?.length || products.data?.data?.products?.length || 0;
  logResult('GET /api/products', products.success, 
    products.success ? `Found ${productsCount} products` : JSON.stringify(products.error));

  // Test 3: Get Products with filters
  console.log('3. Testing GET /api/products?limit=5...');
  const productsLimit = await apiRequest('GET', '/api/products?limit=5');
  const productsLimitCount = productsLimit.data?.products?.length || productsLimit.data?.data?.products?.length || 0;
  logResult('GET /api/products?limit=5', productsLimit.success && productsLimitCount <= 5,
    productsLimit.success ? `Returned ${productsLimitCount} products` : JSON.stringify(productsLimit.error));

  // Test 4: Get Single Product (Public) 
  const productsList = products.data?.products || products.data?.data?.products || [];
  if (products.success && productsList.length > 0) {
    console.log('4. Testing GET /api/products/:id...');
    const productId = productsList[0].id;
    const singleProduct = await apiRequest('GET', `/api/products/${productId}`);
    logResult('GET /api/products/:id', singleProduct.success,
      singleProduct.success ? `Found product` : JSON.stringify(singleProduct.error));
  } else {
    logResult('GET /api/products/:id', false, 'No products available to test');
  }

  // Test 5: Protected endpoints (should return 401)
  console.log('5. Testing Protected Endpoints (should return 401)...');
  const inventory = await apiRequest('GET', '/api/inventory');
  logResult('GET /api/inventory (protected)', inventory.status === 401, 'Should be unauthorized');

  const warehouses = await apiRequest('GET', '/api/warehouses');
  logResult('GET /api/warehouses (protected)', warehouses.status === 401, 'Should be unauthorized');

  const orders = await apiRequest('GET', '/api/orders');
  logResult('GET /api/orders (protected)', orders.status === 401, 'Should be unauthorized');

  // Test 6: Auth endpoints
  console.log('6. Testing Auth Endpoints...');
  const authMe = await apiRequest('GET', '/auth/me');
  logResult('GET /auth/me (protected)', authMe.status === 401, 'Should be unauthorized');

  // Test 7: Check if login redirect works
  console.log('7. Testing Login Endpoint...');
  try {
    const login = await axios.get(`${API_URL}/auth/login`, { 
      maxRedirects: 0,
      validateStatus: () => true 
    });
    logResult('GET /auth/login', login.status === 302 || login.status === 307, 'Should redirect to Keycloak');
  } catch (error) {
    logResult('GET /auth/login', false, 'Login endpoint error');
  }

  // Test 8: Invalid product ID should return 404
  console.log('8. Testing Invalid Product ID...');
  const invalidProduct = await apiRequest('GET', '/api/products/00000000-0000-0000-0000-000000000000');
  logResult('GET /api/products (invalid ID)', invalidProduct.status === 404, 'Should return 404');

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 API Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${results.passed.length + results.failed.length}`);
  console.log(`✓ Passed: ${results.passed.length}`);
  console.log(`✗ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(f => {
      console.log(`  - ${f.test}`);
      if (f.details) console.log(`    ${f.details}`);
    });
  }

  if (results.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    results.passed.forEach(test => console.log(`  - ${test}`));
  }

  console.log('='.repeat(60));

  return results.failed.length === 0;
}

runTests()
  .then(success => {
    if (success) {
      console.log('\n🎉 All API tests passed!');
      process.exit(0);
    } else {
      console.log('\n⚠️ Some tests failed. Please review the output above.');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('❌ Fatal error running tests:', error);
    process.exit(1);
  });
