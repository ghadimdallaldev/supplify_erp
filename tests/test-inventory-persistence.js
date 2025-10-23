// Quick test to verify inventory persistence is working
// Run this in your browser console to test the inventory system

console.log('🧪 Testing Inventory Persistence\n');

// Test data
const testOrderData = {
  orderId: 'PERSISTENCE-TEST-001',
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

async function testInventoryPersistence() {
  console.log('📦 Testing inventory API with persistence...\n');
  
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
      console.log('✅ Inventory summary:', summary);
      console.log(`   Total Items: ${summary.totalItems}`);
      console.log(`   Total Value: $${summary.totalValue}`);
      
      if (summary.items.length > 0) {
        console.log('   Items:');
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
      console.log('✅ Recent activity:', activity);
      
      if (activity.length > 0) {
        console.log('   Recent movements:');
        activity.forEach((entry, index) => {
          console.log(`     ${index + 1}. ${entry.itemName}: ${entry.movementType} ${entry.quantity} units (${entry.reason})`);
        });
      } else {
        console.log('   No recent activity found');
      }
    } else {
      const errorText = await activityResponse.text();
      console.log('❌ Failed to get recent activity:', errorText);
    }

    // Step 4: Check localStorage
    console.log('\n4. Checking localStorage persistence...');
    const inventoryData = localStorage.getItem('supplify-inventory');
    const activityData = localStorage.getItem('supplify-inventory-activity');
    
    if (inventoryData) {
      const inventory = JSON.parse(inventoryData);
      console.log('✅ Inventory data in localStorage:', inventory.length, 'items');
    } else {
      console.log('❌ No inventory data in localStorage');
    }
    
    if (activityData) {
      const activity = JSON.parse(activityData);
      console.log('✅ Activity data in localStorage:', activity.length, 'entries');
    } else {
      console.log('❌ No activity data in localStorage');
    }

    console.log('\n🎉 Test completed!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Refresh the inventory page: http://localhost:3000/restaurant/inventory');
    console.log('   2. You should see the items and activity');
    console.log('   3. The data should persist between page refreshes');

  } catch (error) {
    console.log('❌ Error testing inventory:', error);
  }
}

// Run the test
testInventoryPersistence();
