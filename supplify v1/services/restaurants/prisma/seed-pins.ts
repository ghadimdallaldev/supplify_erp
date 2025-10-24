import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed pinned products for demo
 */
async function seedPins() {
  console.log('🌱 Seeding pinned products...');

  const restaurantId = 'rest-demo-001';
  const supplierId = 'sup-sysco-001';

  // Sample product IDs (these should match actual products in catalog service)
  const productIds = [
    'prod-chicken-breast',
    'prod-olive-oil',
    'prod-flour-ap',
    'prod-tomato-sauce',
  ];

  // Create pins
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];

    await prisma.pinnedProduct.upsert({
      where: {
        restaurantId_supplierId_productId: {
          restaurantId,
          supplierId,
          productId,
        },
      },
      update: {
        sortIndex: i,
      },
      create: {
        restaurantId,
        supplierId,
        productId,
        sortIndex: i,
        note: i === 0 ? 'Weekly staple' : i === 1 ? 'High quality brand' : null,
      },
    });
  }

  console.log(`✅ Created ${productIds.length} pinned products`);
  console.log(`   Restaurant: ${restaurantId}`);
  console.log(`   Supplier: ${supplierId}`);
}

seedPins()
  .catch((e) => {
    console.error('Error seeding pins:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

