// Test script to demonstrate inventory updates
// This would typically be run in a test environment

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testInventoryUpdate() {
  console.log('🧪 Testing Inventory Update System...\n');

  try {
    // 1. Create a test order
    console.log('1. Creating test order...');
    const order = await prisma.order.create({
      data: {
        restaurantId: 'golden-fork',
        supplierId: 'fresh-foods',
        status: 'PENDING',
        total: 150.00,
        subtotal: 136.36,
        taxAmount: 13.64,
        currency: 'USD',
        notes: 'Test order for inventory update',
        items: {
          create: [
            {
              productId: 'prod-test-001',
              productName: 'Test Tomatoes',
              quantity: 25,
              unitPrice: 2.50,
              total: 62.50,
            },
            {
              productId: 'prod-test-002',
              productName: 'Test Lettuce',
              quantity: 15,
              unitPrice: 3.00,
              total: 45.00,
            },
            {
              productId: 'prod-test-003',
              productName: 'Test Onions',
              quantity: 10,
              unitPrice: 4.25,
              total: 42.50,
            },
          ],
        },
        events: {
          create: {
            type: 'PENDING',
            actorType: 'SYSTEM',
            payload: { testOrder: true },
          },
        },
      },
      include: { items: true },
    });

    console.log(`✅ Order created: ${order.id}`);
    console.log(`   Items: ${order.items.length}`);
    console.log(`   Total: $${order.total}\n`);

    // 2. Update order status to DELIVERED (this triggers inventory update)
    console.log('2. Updating order status to DELIVERED...');
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        events: {
          create: {
            type: 'DELIVERED',
            actorType: 'SYSTEM',
            payload: { deliveredAt: new Date().toISOString() },
          },
        },
      },
    });

    console.log(`✅ Order status updated to: ${updatedOrder.status}\n`);

    // 3. Check inventory items created
    console.log('3. Checking inventory items...');
    const inventoryItems = await prisma.item.findMany({
      where: { restaurantId: 'golden-fork' },
      include: {
        stockOnHand: true,
        stockLedger: {
          where: { refId: order.id },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    console.log(`✅ Found ${inventoryItems.length} inventory items:`);
    inventoryItems.forEach(item => {
      const stock = item.stockOnHand[0];
      const ledger = item.stockLedger[0];
      console.log(`   - ${item.name}: ${stock?.qtyOnHandBase || 0} units (Cost: $${stock?.lastCost || 0})`);
      if (ledger) {
        console.log(`     📝 Ledger entry: ${ledger.movementType} - ${ledger.qtyBase} units`);
      }
    });

    // 4. Check stock ledger entries
    console.log('\n4. Checking stock ledger entries...');
    const ledgerEntries = await prisma.stockLedger.findMany({
      where: { refId: order.id },
      include: { item: true },
    });

    console.log(`✅ Found ${ledgerEntries.length} ledger entries:`);
    ledgerEntries.forEach(entry => {
      console.log(`   - ${entry.item.name}: ${entry.qtyBase} units (${entry.movementType})`);
      console.log(`     Cost: $${entry.unitCost} | Total: $${entry.extCost}`);
    });

    // 5. Check stock on hand
    console.log('\n5. Checking stock on hand...');
    const stockOnHand = await prisma.stockOnHand.findMany({
      where: { restaurantId: 'golden-fork' },
      include: { item: true, location: true },
    });

    console.log(`✅ Found ${stockOnHand.length} stock records:`);
    stockOnHand.forEach(stock => {
      console.log(`   - ${stock.item.name}: ${stock.qtyOnHandBase} units`);
      console.log(`     Available: ${stock.qtyAvailableBase} | Value: $${stock.totalValue}`);
      console.log(`     Location: ${stock.location.name}`);
    });

    console.log('\n🎉 Inventory update test completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   - Order: ${order.id}`);
    console.log(`   - Items processed: ${order.items.length}`);
    console.log(`   - Inventory items: ${inventoryItems.length}`);
    console.log(`   - Ledger entries: ${ledgerEntries.length}`);
    console.log(`   - Stock records: ${stockOnHand.length}`);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testInventoryUpdate();
