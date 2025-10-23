// Test script to create orders and test the complete UI flow
// This will create orders that you can process through the UI

console.log('🧪 Creating Test Orders for UI Flow Test\n');

// Test order data
const testOrders = [
  {
    id: 'UI-TEST-001',
    supplierId: 'fresh-foods',
    supplier: 'Fresh Foods Supply',
    restaurantId: 'golden-fork',
    restaurant: 'Golden Fork Restaurant',
    items: 3,
    total: 125.00,
    deliveryDate: '2025-01-25',
    notes: 'UI flow test order',
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
  {
    id: 'UI-TEST-002',
    supplierId: 'premium-meats',
    supplier: 'Premium Meats Co.',
    restaurantId: 'golden-fork',
    restaurant: 'Golden Fork Restaurant',
    items: 2,
    total: 144.00,
    deliveryDate: '2025-01-26',
    notes: 'Premium quality meat order',
    orderItems: [
      {
        productId: 'prod-004',
        name: 'Artisan Bread',
        quantity: 12,
        price: 4.50,
      },
      {
        productId: 'prod-005',
        name: 'Premium Beef',
        quantity: 8,
        price: 15.00,
      },
    ],
    status: 'Pending',
    createdAt: new Date().toISOString(),
  },
];

function createTestOrders() {
  console.log('📝 Creating test orders for UI flow test...\n');
  
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
  console.log('\n📋 UI Flow Test Steps:');
  console.log('   1. Go to Supplier Orders: http://localhost:3000/supplier/orders');
  console.log('   2. You should see the test orders with "Pending" status');
  console.log('   3. Click "Process" on an order → Status: Processing');
  console.log('   4. Click "Ship" on the order → Status: Dispatched');
  console.log('   5. Click "Deliver" on the order → Status: Delivered ⭐');
  console.log('   6. Go to Restaurant Inventory: http://localhost:3000/restaurant/inventory');
  console.log('   7. You should see the items automatically added to inventory!');
  console.log('   8. Check Recent Activity - it should show real receipt entries');
  console.log('\n✨ The inventory will update automatically when you click "Deliver"!');
}

// Run the function
createTestOrders();
