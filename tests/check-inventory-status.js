// Verification script to check inventory status
// Run this after processing orders through the UI

console.log('🔍 Checking Inventory Status\n');

async function checkInventoryStatus() {
  try {
    // Check inventory summary
    console.log('📊 Checking inventory summary...');
    const summaryResponse = await fetch('/api/inventory/summary/golden-fork');
    
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      console.log('✅ Inventory Summary:');
      console.log(`   Total Items: ${summary.totalItems}`);
      console.log(`   Total Value: $${summary.totalValue}`);
      
      if (summary.items.length > 0) {
        console.log('   Items in inventory:');
        summary.items.forEach((item, index) => {
          console.log(`     ${index + 1}. ${item.name}`);
          console.log(`        SKU: ${item.sku}`);
          console.log(`        Qty On Hand: ${item.qtyOnHand}`);
          console.log(`        Unit Cost: $${item.unitCost}`);
          console.log(`        Total Value: $${item.totalValue}`);
          console.log(`        Location: ${item.location}`);
          console.log('');
        });
      } else {
        console.log('   No items found in inventory');
        console.log('   Try processing an order through the UI first');
      }
    } else {
      console.log('❌ Failed to get inventory summary');
    }

    // Check recent activity
    console.log('📈 Checking recent activity...');
    const activityResponse = await fetch('/api/inventory/activity/golden-fork?limit=10');
    
    if (activityResponse.ok) {
      const activity = await activityResponse.json();
      console.log('✅ Recent Activity:');
      
      if (activity.length > 0) {
        activity.forEach((entry, index) => {
          console.log(`   ${index + 1}. ${entry.itemName}`);
          console.log(`      Type: ${entry.movementType}`);
          console.log(`      Quantity: ${entry.quantity > 0 ? '+' : ''}${entry.quantity}`);
          console.log(`      Reason: ${entry.reason}`);
          console.log(`      Time: ${new Date(entry.timestamp).toLocaleString()}`);
          console.log('');
        });
      } else {
        console.log('   No recent activity found');
        console.log('   Try processing an order through the UI first');
      }
    } else {
      console.log('❌ Failed to get recent activity');
    }

    // Check localStorage
    console.log('💾 Checking localStorage...');
    const inventoryData = localStorage.getItem('supplify-inventory');
    const activityData = localStorage.getItem('supplify-inventory-activity');
    
    if (inventoryData) {
      const inventory = JSON.parse(inventoryData);
      console.log(`✅ Inventory data in localStorage: ${inventory.length} items`);
    } else {
      console.log('❌ No inventory data in localStorage');
    }
    
    if (activityData) {
      const activity = JSON.parse(activityData);
      console.log(`✅ Activity data in localStorage: ${activity.length} entries`);
    } else {
      console.log('❌ No activity data in localStorage');
    }

  } catch (error) {
    console.log('❌ Error checking inventory status:', error);
  }
}

// Run the check
checkInventoryStatus();
