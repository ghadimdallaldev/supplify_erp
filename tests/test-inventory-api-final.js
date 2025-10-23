// Test script to verify inventory system is working
// This will test the API endpoints and show if data is being persisted

console.log('🧪 Testing Inventory System with Real API Calls\n');

// Test data
const testOrderData = {
  orderId: 'API-TEST-001',
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

async function testInventoryAPI() {
  console.log('📦 Testing inventory API endpoints...\n');
  
  try {
    // Step 1: Add items to inventory
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
      return;
    }

    // Step 2: Check inventory summary
    console.log('\n2. Checking inventory summary...');
    const summaryResponse = await fetch('/api/inventory/summary/golden-fork');
    
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      console.log('✅ Inventory Summary:');
      console.log(`   Total Items: ${summary.totalItems}`);
      console.log(`   Total Value: $${summary.totalValue}`);
      
      if (summary.items.length > 0) {
        console.log('   Items in inventory:');
        summary.items.forEach((item, index) => {
          console.log(`     ${index + 1}. ${item.name} - ${item.qtyOnHand} units @ $${item.unitCost}`);
        });
      } else {
        console.log('   No items found in inventory');
      }
    } else {
      const errorText = await summaryResponse.text();
      console.log('❌ Failed to get inventory summary:', errorText);
    }

    // Step 3: Check recent activity
    console.log('\n3. Checking recent activity...');
    const activityResponse = await fetch('/api/inventory/activity/golden-fork?limit=5');
    
    if (activityResponse.ok) {
      const activity = await activityResponse.json();
      console.log('✅ Recent Activity:');
      
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

    console.log('\n🎉 API test completed!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Go to Restaurant Inventory: http://localhost:3000/restaurant/inventory');
    console.log('   2. You should see the items and activity');
    console.log('   3. Refresh the page - data should persist');
    console.log('   4. Try processing orders through the UI');

  } catch (error) {
    console.log('❌ Error testing inventory API:', error);
  }
}

// Run the test
testInventoryAPI();
