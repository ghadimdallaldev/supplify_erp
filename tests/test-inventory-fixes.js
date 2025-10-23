// Test script to verify inventory fixes
// This script tests the inventory increment functionality and database persistence

console.log('🧪 Testing Inventory Fixes...\n');

// Test 1: Verify localStorage is not being used for inventory
console.log('1. Checking localStorage usage...');
const inventoryKeys = Object.keys(localStorage).filter(key => key.includes('inventory'));
if (inventoryKeys.length > 0) {
  console.log('❌ Found localStorage inventory keys:', inventoryKeys);
  console.log('   This indicates the old localStorage system is still being used!');
} else {
  console.log('✅ No localStorage inventory keys found - using real database');
}

// Test 2: Check if inventory API endpoints are available
console.log('\n2. Testing inventory API endpoints...');

async function testInventoryAPI() {
  try {
    // Test summary endpoint
    const summaryResponse = await fetch('/api/inventory/summary/golden-fork');
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      console.log('✅ Inventory summary endpoint working');
      console.log(`   Total items: ${summary.totalItems}`);
      console.log(`   Total value: $${summary.totalValue.toFixed(2)}`);
    } else {
      console.log('❌ Inventory summary endpoint failed:', summaryResponse.status);
    }

    // Test activity endpoint
    const activityResponse = await fetch('/api/inventory/activity/golden-fork?limit=5');
    if (activityResponse.ok) {
      const activity = await activityResponse.json();
      console.log('✅ Inventory activity endpoint working');
      console.log(`   Recent activities: ${activity.length}`);
    } else {
      console.log('❌ Inventory activity endpoint failed:', activityResponse.status);
    }

    // Test adjustment endpoint (if we have items)
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      if (summary.items.length > 0) {
        const firstItem = summary.items[0];
        console.log(`\n3. Testing stock adjustment for item: ${firstItem.name}`);
        
        const adjustmentResponse = await fetch('/api/inventory/adjustment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: firstItem.id,
            locationId: 'main-storage',
            restaurantId: 'golden-fork',
            adjustment: 5, // Add 5 units
            reason: 'Test adjustment',
            userId: 'test-user',
          }),
        });

        if (adjustmentResponse.ok) {
          console.log('✅ Stock adjustment working - added 5 units');
          
          // Check if the adjustment was reflected
          const updatedSummaryResponse = await fetch('/api/inventory/summary/golden-fork');
          if (updatedSummaryResponse.ok) {
            const updatedSummary = await updatedSummaryResponse.json();
            const updatedItem = updatedSummary.items.find(item => item.id === firstItem.id);
            if (updatedItem && updatedItem.qtyOnHand > firstItem.qtyOnHand) {
              console.log(`✅ Stock properly incremented: ${firstItem.qtyOnHand} → ${updatedItem.qtyOnHand}`);
            } else {
              console.log('❌ Stock was not properly incremented');
            }
          }
        } else {
          console.log('❌ Stock adjustment failed:', adjustmentResponse.status);
        }
      } else {
        console.log('⚠️  No items found to test adjustment');
      }
    }

  } catch (error) {
    console.log('❌ API test failed:', error.message);
  }
}

// Run the test
testInventoryAPI().then(() => {
  console.log('\n🎯 Test Summary:');
  console.log('✅ Inventory system should now:');
  console.log('   - Use real PostgreSQL database instead of localStorage');
  console.log('   - Add to existing stock instead of overriding');
  console.log('   - Save all activity to database');
  console.log('   - Persist data across browser refreshes and logouts');
  console.log('\n📝 Next steps:');
  console.log('   1. Create an order and mark it as delivered');
  console.log('   2. Check restaurant inventory - items should appear');
  console.log('   3. Use +/- buttons to adjust stock');
  console.log('   4. Verify stock increments add to existing amounts');
  console.log('   5. Check recent activity shows all movements');
});
