// Test script to create orders and demonstrate the inventory system
// This will create test orders that can be delivered to add items to inventory

console.log('🧪 Creating Test Orders for Inventory Demo\n');

// Test order data
const testOrders = [
  {
    id: 'ORD-001',
    supplierId: 'fresh-foods',
    supplier: 'Fresh Foods Supply',
    restaurantId: 'golden-fork',
    restaurant: 'Golden Fork Restaurant',
    items: 3,
    total: 125.00,
    deliveryDate: '2025-01-25',
    notes: 'Please deliver fresh produce',
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
    createdAt: '2025-01-20T10:00:00Z',
  },
  {
    id: 'ORD-002',
    supplierId: 'premium-meats',
    supplier: 'Premium Meats Co.',
    restaurantId: 'golden-fork',
    restaurant: 'Golden Fork Restaurant',
    items: 2,
    total: 144.00,
    deliveryDate: '2025-01-26',
    notes: 'Premium quality meat required',
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
    createdAt: '2025-01-21T14:30:00Z',
  },
];

// Function to create orders in localStorage
function createTestOrders() {
  console.log('📝 Creating test orders...\n');
  
  // Get existing orders from localStorage
  const existingOrders = JSON.parse(localStorage.getItem('supplify-orders') || '[]');
  
  // Add test orders if they don't exist
  testOrders.forEach(testOrder => {
    const exists = existingOrders.find((order: any) => order.id === testOrder.id);
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
  console.log('   1. Go to Supplier Orders page: http://localhost:3000/supplier/orders');
  console.log('   2. Click "Process" on an order to change status to Processing');
  console.log('   3. Click "Ship" to change status to Dispatched');
  console.log('   4. Click "Deliver" to change status to Delivered');
  console.log('   5. Go to Restaurant Inventory page: http://localhost:3000/restaurant/inventory');
  console.log('   6. You will see the items added to inventory automatically!');
  console.log('\n✨ The inventory will update in real-time when orders are delivered!');
}

// Run the function
createTestOrders();
