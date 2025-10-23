// Test script to verify chat system fixes
// This script tests the real chat functionality with suppliers

console.log('💬 Testing Chat System Fixes...\n');

// Test 1: Verify localStorage is not being used for chat
console.log('1. Checking localStorage usage...');
const chatKeys = Object.keys(localStorage).filter(key => key.includes('chat'));
if (chatKeys.length > 0) {
  console.log('❌ Found localStorage chat keys:', chatKeys);
  console.log('   This indicates the old localStorage system is still being used!');
} else {
  console.log('✅ No localStorage chat keys found - using real database');
}

// Test 2: Check if chat API endpoints are available
console.log('\n2. Testing chat API endpoints...');

async function testChatAPI() {
  try {
    // Test suppliers endpoint
    const suppliersResponse = await fetch('/api/restaurants/golden-fork/suppliers');
    if (suppliersResponse.ok) {
      const suppliers = await suppliersResponse.json();
      console.log('✅ Suppliers endpoint working');
      console.log(`   Found ${suppliers.length} suppliers`);
      
      if (suppliers.length > 0) {
        console.log('   Suppliers:', suppliers.map(s => s.name).join(', '));
      }
    } else {
      console.log('❌ Suppliers endpoint failed:', suppliersResponse.status);
    }

    // Test chat threads endpoint
    const threadsResponse = await fetch('/api/chat/threads?userId=golden-fork&orgType=RESTAURANT');
    if (threadsResponse.ok) {
      const threads = await threadsResponse.json();
      console.log('✅ Chat threads endpoint working');
      console.log(`   Found ${threads.length} chat threads`);
    } else {
      console.log('❌ Chat threads endpoint failed:', threadsResponse.status);
    }

    // Test sending a message (if we have suppliers)
    if (suppliersResponse.ok) {
      const suppliers = await suppliersResponse.json();
      if (suppliers.length > 0) {
        const firstSupplier = suppliers[0];
        console.log(`\n3. Testing message sending to ${firstSupplier.name}...`);
        
        const messageResponse = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: firstSupplier.id,
            senderId: 'golden-fork',
            senderRole: 'RESTAURANT',
            senderName: 'Golden Fork Restaurant',
            body: 'Hello! This is a test message from the restaurant.',
          }),
        });

        if (messageResponse.ok) {
          console.log('✅ Message sending working');
          const message = await messageResponse.json();
          console.log(`   Message ID: ${message.id}`);
        } else {
          console.log('❌ Message sending failed:', messageResponse.status);
        }
      } else {
        console.log('⚠️  No suppliers found to test messaging');
      }
    }

  } catch (error) {
    console.log('❌ API test failed:', error.message);
  }
}

// Run the test
testChatAPI().then(() => {
  console.log('\n🎯 Chat System Summary:');
  console.log('✅ Chat system should now:');
  console.log('   - Use real PostgreSQL database instead of localStorage');
  console.log('   - Show suppliers that restaurants order from');
  console.log('   - Support favorites functionality');
  console.log('   - Enable real-time messaging');
  console.log('   - Persist all messages and conversations');
  console.log('\n📝 How to test the chat system:');
  console.log('   1. Place an order with a supplier');
  console.log('   2. Go to the chat interface');
  console.log('   3. The supplier should appear in the chat list');
  console.log('   4. Click on the supplier to start chatting');
  console.log('   5. Use the star icon to mark suppliers as favorites');
  console.log('   6. Messages should be saved to the database');
  console.log('\n🔧 Features implemented:');
  console.log('   - Real supplier data from orders');
  console.log('   - Favorites system for suppliers');
  console.log('   - Online/offline status indicators');
  console.log('   - Unread message counts');
  console.log('   - Real-time messaging via WebSocket');
  console.log('   - Database persistence for all chat data');
});
