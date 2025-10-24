import { PrismaClient, StorageType, MovementType, BatchStatus, CountType, CountStatus, ValuationMethod } from '@prisma/client';
import { addDays, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting inventory seed...');

  // Clean existing data
  await prisma.inventoryCountLine.deleteMany();
  await prisma.inventoryCount.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.valuationSnapshot.deleteMany();
  await prisma.recipeComponent.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.stockLedger.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.stockOnHand.deleteMany();
  await prisma.parConfig.deleteMany();
  await prisma.supplierLink.deleteMany();
  await prisma.item.deleteMany();
  await prisma.location.deleteMany();
  await prisma.uom.deleteMany();

  const restaurantId = 'rest-001'; // Demo restaurant

  // ========== UOM Definitions ==========
  console.log('Creating UOM definitions...');
  
  const uoms = [
    // Weight
    { code: 'kg', name: 'Kilogram', baseCode: null, ratioToBase: 1.0 },
    { code: 'g', name: 'Gram', baseCode: 'kg', ratioToBase: 0.001 },
    { code: 'lb', name: 'Pound', baseCode: 'kg', ratioToBase: 0.453592 },
    { code: 'oz', name: 'Ounce', baseCode: 'kg', ratioToBase: 0.0283495 },
    
    // Volume
    { code: 'L', name: 'Liter', baseCode: null, ratioToBase: 1.0 },
    { code: 'ml', name: 'Milliliter', baseCode: 'L', ratioToBase: 0.001 },
    { code: 'gal', name: 'Gallon', baseCode: 'L', ratioToBase: 3.78541 },
    
    // Count
    { code: 'each', name: 'Each', baseCode: null, ratioToBase: 1.0 },
    { code: 'pack', name: 'Pack', baseCode: 'each', ratioToBase: 6.0 },
    { code: 'case', name: 'Case', baseCode: 'each', ratioToBase: 24.0 },
    { code: 'dozen', name: 'Dozen', baseCode: 'each', ratioToBase: 12.0 },
  ];

  for (const uom of uoms) {
    await prisma.uom.create({ data: uom });
  }

  // ========== Locations ==========
  console.log('Creating locations...');
  
  const kitchen = await prisma.location.create({
    data: {
      restaurantId,
      name: 'Main Kitchen',
      code: 'KITCHEN',
      active: true,
    },
  });

  const dryStore = await prisma.location.create({
    data: {
      restaurantId,
      name: 'Dry Storage',
      code: 'DRY-STORE',
      active: true,
    },
  });

  // ========== Items ==========
  console.log('Creating items...');
  
  const items = [
    // DRY items
    {
      name: 'All-Purpose Flour',
      sku: 'FLOUR-001',
      barcode: '1234567890123',
      storageType: StorageType.DRY,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-dry-goods',
      allergenFlags: ['gluten'],
      yieldPct: 100,
    },
    {
      name: 'White Sugar',
      sku: 'SUGAR-001',
      barcode: '1234567890124',
      storageType: StorageType.DRY,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-dry-goods',
      allergenFlags: [],
      yieldPct: 100,
    },
    {
      name: 'Olive Oil Extra Virgin',
      sku: 'OIL-001',
      barcode: '1234567890125',
      storageType: StorageType.DRY,
      uomBase: 'L',
      uomDisplay: 'L',
      categoryId: 'cat-oils',
      allergenFlags: [],
      yieldPct: 100,
    },
    {
      name: 'Spaghetti Pasta',
      sku: 'PASTA-001',
      barcode: '1234567890126',
      storageType: StorageType.DRY,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-dry-goods',
      allergenFlags: ['gluten'],
      yieldPct: 100,
    },
    
    // CHILL items
    {
      name: 'Fresh Whole Milk',
      sku: 'MILK-001',
      barcode: '2234567890123',
      storageType: StorageType.CHILL,
      uomBase: 'L',
      uomDisplay: 'L',
      categoryId: 'cat-dairy',
      allergenFlags: ['dairy'],
      yieldPct: 100,
    },
    {
      name: 'Cheddar Cheese Block',
      sku: 'CHEESE-001',
      barcode: '2234567890124',
      storageType: StorageType.CHILL,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-dairy',
      allergenFlags: ['dairy'],
      yieldPct: 95,
    },
    {
      name: 'Fresh Chicken Breast',
      sku: 'CHICKEN-001',
      barcode: '2234567890125',
      storageType: StorageType.CHILL,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-proteins',
      allergenFlags: [],
      yieldPct: 85,
    },
    {
      name: 'Roma Tomatoes',
      sku: 'TOMATO-001',
      barcode: '2234567890126',
      storageType: StorageType.CHILL,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-produce',
      allergenFlags: [],
      yieldPct: 90,
    },
    
    // FREEZE items
    {
      name: 'Frozen Peas',
      sku: 'PEAS-001',
      barcode: '3234567890123',
      storageType: StorageType.FREEZE,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-frozen-veg',
      allergenFlags: [],
      yieldPct: 100,
    },
    {
      name: 'Frozen Shrimp (16/20)',
      sku: 'SHRIMP-001',
      barcode: '3234567890124',
      storageType: StorageType.FREEZE,
      uomBase: 'kg',
      uomDisplay: 'kg',
      categoryId: 'cat-frozen-seafood',
      allergenFlags: ['shellfish'],
      yieldPct: 80,
    },
    {
      name: 'Vanilla Ice Cream',
      sku: 'ICE-001',
      barcode: '3234567890125',
      storageType: StorageType.FREEZE,
      uomBase: 'L',
      uomDisplay: 'L',
      categoryId: 'cat-desserts',
      allergenFlags: ['dairy'],
      yieldPct: 100,
    },
    
    // CHEMICAL
    {
      name: 'Dish Soap Concentrate',
      sku: 'SOAP-001',
      barcode: '4234567890123',
      storageType: StorageType.CHEMICAL,
      uomBase: 'L',
      uomDisplay: 'L',
      categoryId: 'cat-cleaning',
      allergenFlags: [],
      yieldPct: 100,
    },
  ];

  const createdItems = [];
  for (const itemData of items) {
    const item = await prisma.item.create({
      data: {
        ...itemData,
        restaurantId,
        active: true,
      },
    });
    createdItems.push(item);
  }

  // ========== Suppliers & Links ==========
  console.log('Creating supplier links...');
  
  const supplierIds = ['sup-sysco', 'sup-usfoods', 'sup-localfarm'];
  
  // Create supplier links for first 8 items
  for (let i = 0; i < 8; i++) {
    const item = createdItems[i];
    const supplierId = supplierIds[i % 3];
    
    await prisma.supplierLink.create({
      data: {
        itemId: item.id,
        supplierId,
        supplierProductId: `${supplierId}-${item.sku}`,
        vendorUom: 'case',
        unitsPerVendorUom: 12,
        leadTimeDays: 2 + (i % 3),
        lastPrice: 15.0 + i * 5,
        preferred: true,
      },
    });
  }

  // ========== Batches & Initial Stock ==========
  console.log('Creating batches and initial stock...');
  
  const causedBy = 'seed-user-001';
  
  // Helper to create receipt
  async function receiveStock(
    item: any,
    location: any,
    qty: number,
    unitCost: number,
    expiryDate?: Date,
    lotCode?: string
  ) {
    const batch = await prisma.batch.create({
      data: {
        itemId: item.id,
        locationId: location.id,
        qtyOnHandBase: qty,
        expiryDate,
        lotCode,
        supplierId: 'sup-sysco',
        lastUnitCost: unitCost,
        status: BatchStatus.OK,
      },
    });

    await prisma.stockLedger.create({
      data: {
        itemId: item.id,
        restaurantId,
        locationId: location.id,
        batchId: batch.id,
        movementType: MovementType.RECEIPT,
        qtyBase: qty,
        uomBase: item.uomBase,
        unitCost,
        extCost: qty * unitCost,
        refType: 'PO',
        refId: `PO-${Math.random().toString(36).substring(7)}`,
        causedBy,
        reason: 'Initial stock receipt',
        timestamp: subDays(new Date(), Math.floor(Math.random() * 10)),
      },
    });

    return batch;
  }

  // Receive stock for various items
  // Flour - 2 batches
  await receiveStock(createdItems[0], dryStore, 50, 2.5, null, 'LOT-FL-001');
  await receiveStock(createdItems[0], dryStore, 25, 2.6, null, 'LOT-FL-002');
  
  // Sugar
  await receiveStock(createdItems[1], dryStore, 40, 1.8, null, 'LOT-SG-001');
  
  // Olive Oil
  await receiveStock(createdItems[2], dryStore, 20, 12.5, null, 'LOT-OO-001');
  
  // Pasta
  await receiveStock(createdItems[3], dryStore, 30, 3.2, null, 'LOT-PA-001');
  
  // Milk - near expiry!
  await receiveStock(createdItems[4], kitchen, 15, 1.5, addDays(new Date(), 3), 'LOT-ML-001');
  await receiveStock(createdItems[4], kitchen, 10, 1.5, addDays(new Date(), 5), 'LOT-ML-002');
  
  // Cheese - expiring soon
  await receiveStock(createdItems[5], kitchen, 12, 8.5, addDays(new Date(), 10), 'LOT-CH-001');
  
  // Chicken - expires very soon (FEFO priority)
  await receiveStock(createdItems[6], kitchen, 8, 6.5, addDays(new Date(), 2), 'LOT-CK-001');
  await receiveStock(createdItems[6], kitchen, 5, 6.8, addDays(new Date(), 4), 'LOT-CK-002');
  
  // Tomatoes
  await receiveStock(createdItems[7], kitchen, 10, 3.0, addDays(new Date(), 7), 'LOT-TM-001');
  
  // Frozen items (longer expiry)
  await receiveStock(createdItems[8], dryStore, 25, 4.5, addDays(new Date(), 180), 'LOT-PS-001');
  await receiveStock(createdItems[9], dryStore, 15, 18.0, addDays(new Date(), 90), 'LOT-SH-001');
  await receiveStock(createdItems[10], dryStore, 20, 5.5, addDays(new Date(), 365), 'LOT-IC-001');

  // ========== Some Issues (consumption) ==========
  console.log('Creating consumption movements...');
  
  async function issueStock(item: any, location: any, qty: number) {
    // Find FEFO batch
    const batch = await prisma.batch.findFirst({
      where: {
        itemId: item.id,
        locationId: location.id,
        qtyOnHandBase: { gt: 0 },
        status: BatchStatus.OK,
      },
      orderBy: [
        { expiryDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    if (!batch) return;

    const issueQty = Math.min(qty, batch.qtyOnHandBase);
    
    await prisma.batch.update({
      where: { id: batch.id },
      data: { qtyOnHandBase: { decrement: issueQty } },
    });

    await prisma.stockLedger.create({
      data: {
        itemId: item.id,
        restaurantId,
        locationId: location.id,
        batchId: batch.id,
        movementType: MovementType.ISSUE,
        qtyBase: -issueQty,
        uomBase: item.uomBase,
        unitCost: batch.lastUnitCost,
        extCost: -(issueQty * batch.lastUnitCost),
        refType: 'RECIPE',
        refId: `RECIPE-${Math.random().toString(36).substring(7)}`,
        causedBy,
        reason: 'Recipe production',
        timestamp: subDays(new Date(), Math.floor(Math.random() * 5)),
      },
    });
  }

  await issueStock(createdItems[0], dryStore, 10); // Flour
  await issueStock(createdItems[4], kitchen, 5);   // Milk
  await issueStock(createdItems[6], kitchen, 3);   // Chicken

  // ========== Some Wastage ==========
  console.log('Creating wastage movements...');
  
  async function wasteStock(item: any, location: any, qty: number, reason: string) {
    const batch = await prisma.batch.findFirst({
      where: {
        itemId: item.id,
        locationId: location.id,
        qtyOnHandBase: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (!batch) return;

    const wasteQty = Math.min(qty, batch.qtyOnHandBase);
    
    await prisma.batch.update({
      where: { id: batch.id },
      data: { qtyOnHandBase: { decrement: wasteQty } },
    });

    await prisma.stockLedger.create({
      data: {
        itemId: item.id,
        restaurantId,
        locationId: location.id,
        batchId: batch.id,
        movementType: MovementType.WASTE,
        qtyBase: -wasteQty,
        uomBase: item.uomBase,
        unitCost: batch.lastUnitCost,
        extCost: -(wasteQty * batch.lastUnitCost),
        refType: 'WASTE',
        causedBy,
        reason,
        timestamp: subDays(new Date(), 2),
      },
    });
  }

  await wasteStock(createdItems[7], kitchen, 2, 'Spoilage - overripe');

  // ========== Transfer ==========
  console.log('Creating transfer movement...');
  
  // Transfer flour from dry store to kitchen
  const flourBatch = await prisma.batch.findFirst({
    where: { itemId: createdItems[0].id, locationId: dryStore.id },
  });

  if (flourBatch) {
    const transferQty = 5;
    
    // OUT from dry store
    await prisma.batch.update({
      where: { id: flourBatch.id },
      data: { qtyOnHandBase: { decrement: transferQty } },
    });

    await prisma.stockLedger.create({
      data: {
        itemId: createdItems[0].id,
        restaurantId,
        locationId: dryStore.id,
        batchId: flourBatch.id,
        movementType: MovementType.TRANSFER_OUT,
        qtyBase: -transferQty,
        uomBase: createdItems[0].uomBase,
        unitCost: flourBatch.lastUnitCost,
        extCost: -(transferQty * flourBatch.lastUnitCost),
        refType: 'TRANSFER',
        refId: 'XFER-001',
        causedBy,
        reason: 'Transfer to kitchen',
        timestamp: subDays(new Date(), 1),
      },
    });

    // IN to kitchen (new batch)
    const newBatch = await prisma.batch.create({
      data: {
        itemId: createdItems[0].id,
        locationId: kitchen.id,
        qtyOnHandBase: transferQty,
        expiryDate: flourBatch.expiryDate,
        lotCode: flourBatch.lotCode,
        supplierId: flourBatch.supplierId,
        lastUnitCost: flourBatch.lastUnitCost,
        status: BatchStatus.OK,
      },
    });

    await prisma.stockLedger.create({
      data: {
        itemId: createdItems[0].id,
        restaurantId,
        locationId: kitchen.id,
        batchId: newBatch.id,
        movementType: MovementType.TRANSFER_IN,
        qtyBase: transferQty,
        uomBase: createdItems[0].uomBase,
        unitCost: flourBatch.lastUnitCost,
        extCost: transferQty * flourBatch.lastUnitCost,
        refType: 'TRANSFER',
        refId: 'XFER-001',
        causedBy,
        reason: 'Transfer from dry store',
        timestamp: subDays(new Date(), 1),
      },
    });
  }

  // ========== Compute Stock On Hand ==========
  console.log('Computing stock on hand...');
  
  for (const item of createdItems) {
    for (const location of [kitchen, dryStore]) {
      const batches = await prisma.batch.findMany({
        where: {
          itemId: item.id,
          locationId: location.id,
        },
      });

      const totalQty = batches.reduce((sum, b) => sum + b.qtyOnHandBase, 0);
      
      if (totalQty > 0) {
        const avgCost = batches.reduce((sum, b) => sum + (b.qtyOnHandBase * b.lastUnitCost), 0) / totalQty;
        
        await prisma.stockOnHand.create({
          data: {
            itemId: item.id,
            locationId: location.id,
            restaurantId,
            qtyOnHandBase: totalQty,
            qtyCommittedBase: 0,
            qtyAvailableBase: totalQty,
            lastCost: batches[batches.length - 1]?.lastUnitCost || 0,
            avgCost,
            totalValue: totalQty * avgCost,
            lastMovementAt: new Date(),
          },
        });
      }
    }
  }

  // ========== Par Configs ==========
  console.log('Creating par configs...');
  
  const parItems = createdItems.slice(0, 8);
  for (const item of parItems) {
    await prisma.parConfig.create({
      data: {
        itemId: item.id,
        locationId: item.storageType === StorageType.DRY ? dryStore.id : kitchen.id,
        minPar: 10,
        maxPar: 50,
        reorderPoint: 15,
        reorderQty: 30,
        safetyStock: 5,
      },
    });
  }

  // ========== Recipe ==========
  console.log('Creating sample recipe...');
  
  const recipe = await prisma.recipe.create({
    data: {
      restaurantId,
      name: 'Chicken Alfredo Pasta',
      description: 'Classic creamy pasta dish',
      yieldUom: 'portion',
      yieldQty: 4,
      active: true,
    },
  });

  await prisma.recipeComponent.createMany({
    data: [
      {
        recipeId: recipe.id,
        itemId: createdItems[3].id, // Pasta
        qtyBase: 0.4,
        uomBase: 'kg',
        wastePct: 5,
      },
      {
        recipeId: recipe.id,
        itemId: createdItems[6].id, // Chicken
        qtyBase: 0.5,
        uomBase: 'kg',
        wastePct: 15,
      },
      {
        recipeId: recipe.id,
        itemId: createdItems[5].id, // Cheese
        qtyBase: 0.2,
        uomBase: 'kg',
        wastePct: 5,
      },
      {
        recipeId: recipe.id,
        itemId: createdItems[4].id, // Milk
        qtyBase: 0.3,
        uomBase: 'L',
        wastePct: 0,
      },
    ],
  });

  // ========== Inventory Count ==========
  console.log('Creating completed inventory count...');
  
  const count = await prisma.inventoryCount.create({
    data: {
      restaurantId,
      locationId: kitchen.id,
      countType: CountType.CYCLE,
      status: CountStatus.COMPLETED,
      scheduledFor: subDays(new Date(), 7),
      startedAt: subDays(new Date(), 7),
      closedAt: subDays(new Date(), 7),
      conductedBy: causedBy,
      notes: 'Weekly cycle count - kitchen fresh items',
    },
  });

  // Add some count lines with variances
  const kitchenSOH = await prisma.stockOnHand.findMany({
    where: { locationId: kitchen.id },
    take: 4,
  });

  for (const soh of kitchenSOH) {
    const variance = (Math.random() - 0.5) * 2; // -1 to +1 variance
    const countedQty = Math.max(0, soh.qtyOnHandBase + variance);
    
    await prisma.inventoryCountLine.create({
      data: {
        countId: count.id,
        itemId: soh.itemId,
        systemQtyBase: soh.qtyOnHandBase,
        countedQtyBase: countedQty,
        varianceQtyBase: countedQty - soh.qtyOnHandBase,
        varianceCost: (countedQty - soh.qtyOnHandBase) * (soh.avgCost || 0),
        countedBy: causedBy,
        countedAt: subDays(new Date(), 7),
      },
    });
  }

  // ========== Alerts ==========
  console.log('Creating alerts...');
  
  // Low stock alert
  const lowStockSOH = await prisma.stockOnHand.findFirst({
    where: { qtyAvailableBase: { lt: 15 } },
  });

  if (lowStockSOH) {
    await prisma.alert.create({
      data: {
        restaurantId,
        alertType: 'LOW_STOCK',
        severity: 'WARNING',
        itemId: lowStockSOH.itemId,
        locationId: lowStockSOH.locationId,
        message: 'Stock level below reorder point',
        acknowledged: false,
      },
    });
  }

  // Near expiry alerts
  const nearExpiryBatches = await prisma.batch.findMany({
    where: {
      expiryDate: { lte: addDays(new Date(), 7) },
      qtyOnHandBase: { gt: 0 },
    },
    take: 3,
  });

  for (const batch of nearExpiryBatches) {
    await prisma.alert.create({
      data: {
        restaurantId,
        alertType: 'NEAR_EXPIRY',
        severity: batch.expiryDate && batch.expiryDate <= addDays(new Date(), 3) ? 'CRITICAL' : 'WARNING',
        itemId: batch.itemId,
        locationId: batch.locationId,
        batchId: batch.id,
        message: `Batch expiring ${batch.expiryDate?.toLocaleDateString()}`,
        metadata: { lotCode: batch.lotCode, expiryDate: batch.expiryDate },
        acknowledged: false,
      },
    });
  }

  // ========== Valuation Snapshot ==========
  console.log('Creating valuation snapshot...');
  
  const totalValuation = await prisma.stockOnHand.aggregate({
    _sum: { totalValue: true },
    where: { restaurantId },
  });

  const allSOH = await prisma.stockOnHand.findMany({
    where: { restaurantId },
    include: { item: true, location: true },
  });

  const valuationDetails = allSOH.map(soh => ({
    itemId: soh.itemId,
    itemName: soh.item.name,
    locationId: soh.locationId,
    locationName: soh.location.name,
    qty: soh.qtyOnHandBase,
    avgCost: soh.avgCost,
    value: soh.totalValue,
  }));

  await prisma.valuationSnapshot.create({
    data: {
      restaurantId,
      atDate: new Date(),
      method: ValuationMethod.WAVG,
      totalValue: totalValuation._sum.totalValue || 0,
      details: valuationDetails,
    },
  });

  console.log('✅ Seed completed successfully!');
  console.log(`📦 Created ${createdItems.length} items`);
  console.log(`📍 Created 2 locations`);
  console.log(`🏭 Created batches with FEFO expiry tracking`);
  console.log(`📊 ${nearExpiryBatches.length} items expiring soon`);
  console.log(`⚠️  Low stock alerts ready for replenishment page`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

