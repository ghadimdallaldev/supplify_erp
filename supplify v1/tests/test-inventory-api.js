// Test script to directly add items to inventory
// This will help us debug why the inventory isn't updating

console.log('🧪 Testing Inventory API Directly\n');

// Test data
const testOrderData = {
  orderId: 'TEST-ORDER-001',
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
    {
      productId: 'prod-003',
      productName: 'Premium Onions',
      quantity: 10,
      unitPrice: 1.75,
    },
  ],
};

async function testInventoryAPI() {
  console.log('📦 Testing inventory API...\n');
  
  try {
    // Test 1: Add items to inventory
    console.log('1. Adding items to inventory...');
    const addResponse = await fetch('/api/inventory/process-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrderData),
    });

    if (addResponse.ok) {
      const addResult = await addResponse.json();
      console.log('✅ Items added successfully:', addResult);
    } else {
      const errorText = await addResponse.text();
      console.log('❌ Failed to add items:', errorText);
    }

    console.log('\n2. Checking inventory summary...');
    // Test 2: Get inventory summary
    const summaryResponse = await fetch('/api/inventory/summary/golden-fork');
    
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      console.log('✅ Inventory summary:', summary);
      console.log(`   Total Items: ${summary.totalItems}`);
      console.log(`   Total Value: $${summary.totalValue}`);
      console.log(`   Items:`);
      summary.items.forEach((item, index) => {
        console.log(`     ${index + 1}. ${item.name} - ${item.qtyOnHand} units @ $${item.unitCost}`);
      });
    } else {
      const errorText = await summaryResponse.text();
      console.log('❌ Failed to get inventory summary:', errorText);
    }

    console.log('\n3. Checking recent activity...');
    // Test 3: Get recent activity
    const activityResponse = await fetch('/api/inventory/activity/golden-fork?limit=5');
    
    if (activityResponse.ok) {
      const activity = await activityResponse.json();
      console.log('✅ Recent activity:', activity);
      if (activity.length > 0) {
        activity.forEach((entry, index) => {
          console.log(`   ${index + 1}. ${entry.itemName}: ${entry.movementType} ${entry.quantity} units`);
        });
      } else {
        console.log('   No recent activity found');
      }
    } else {
      const errorText = await activityResponse.text();
      console.log('❌ Failed to get recent activity:', errorText);
    }

  } catch (error) {
    console.log('❌ Error testing inventory API:', error);
  }
}

// Run the test
testInventoryAPI();
