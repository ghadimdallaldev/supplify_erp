// Test script to create orders and test the complete flow
// This will help us debug the order-to-inventory connection

console.log('🧪 Creating Test Orders and Testing Complete Flow\n');

// Test order data
const testOrders = [
  {
    id: 'ORD-TEST-001',
    supplierId: 'fresh-foods',
    supplier: 'Fresh Foods Supply',
    restaurantId: 'golden-fork',
    restaurant: 'Golden Fork Restaurant',
    items: 3,
    total: 125.00,
    deliveryDate: '2025-01-25',
    notes: 'Test order for inventory demo',
    orderItems: [
      {
        productId: 'prod-001',
        name: 'Fresh Tomatoes',
        quantity: 25,
        price: 2.50,
      },
      {
        productId: 'prod-002',
        name: 'Organic Lettuce',
        quantity: 15,
        price: 3.00,
      },
      {
        productId: 'prod-003',
        name: 'Premium Onions',
        quantity: 10,
        price: 1.75,
      },
    ],
    status: 'Pending',
    createdAt: new Date().toISOString(),
  },
];

function createTestOrders() {
  console.log('📝 Creating test orders...\n');
  
  // Get existing orders from localStorage
  const existingOrders = JSON.parse(localStorage.getItem('supplify-orders') || '[]');
  console.log(`Found ${existingOrders.length} existing orders`);
  
  // Add test orders
  testOrders.forEach(testOrder => {
    const exists = existingOrders.find(order => order.id === testOrder.id);
    if (!exists) {
      existingOrders.push(testOrder);
      console.log(`✅ Created order: ${testOrder.id}`);
      console.log(`   Restaurant: ${testOrder.restaurant}`);
      console.log(`   Supplier: ${testOrder.supplier}`);
      console.log(`   Items: ${testOrder.items}`);
      console.log(`   Total: $${testOrder.total}`);
      console.log(`   Status: ${testOrder.status}\n`);
    } else {
      console.log(`ℹ️  Order ${testOrder.id} already exists\n`);
    }
  });
  
  // Save to localStorage
  localStorage.setItem('supplify-orders', JSON.stringify(existingOrders));
  
  console.log('🎉 Test orders created successfully!');
  console.log('\n📋 Next Steps:');
  console.log('   1. Go to Supplier Orders: http://localhost:3000/supplier/orders');
  console.log('   2. You should see the test order');
  console.log('   3. Click "Process" → "Ship" → "Deliver"');
  console.log('   4. Check Restaurant Inventory: http://localhost:3000/restaurant/inventory');
  console.log('   5. Items should appear in inventory automatically!');
}

// Function to test inventory directly
async function testInventoryDirectly() {
  console.log('\n🧪 Testing inventory API directly...\n');
  
  const testOrderData = {
    orderId: 'DIRECT-TEST-001',
    restaurantId: 'golden-fork',
    supplierId: 'fresh-foods',
    items: [
      {
        productId: 'prod-001',
        productName: 'Fresh Tomatoes',
        quantity: 25,
        unitPrice: 2.50,
      },
      {
        productId: 'prod-002',
        productName: 'Organic Lettuce',
        quantity: 15,
        unitPrice: 3.00,
      },
    ],
  };

  try {
    // Add items to inventory
    console.log('Adding items to inventory...');
    const response = await fetch('/api/inventory/process-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrderData),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Items added successfully:', result);
      
      // Check inventory
      console.log('\nChecking inventory...');
      const inventoryResponse = await fetch('/api/inventory/summary/golden-fork');
      if (inventoryResponse.ok) {
        const inventory = await inventoryResponse.json();
        console.log('✅ Inventory summary:', inventory);
      } else {
        console.log('❌ Failed to get inventory:', await inventoryResponse.text());
      }
    } else {
      console.log('❌ Failed to add items:', await response.text());
    }
  } catch (error) {
    console.log('❌ Error testing inventory:', error);
  }
}

// Run both tests
createTestOrders();
testInventoryDirectly();