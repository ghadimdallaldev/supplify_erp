import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPromotionsExtendedFlag() {
  console.log('Seeding promotions_extended flag...');

  // Create the promotions_extended flag
  const flag = await prisma.featureFlag.upsert({
    where: { key: 'promotions_extended' },
    update: {},
    create: {
      key: 'promotions_extended',
      name: 'PromoSuite Extended Campaigns',
      description: 'Enables Sponsored Visibility, Discount Campaign, and Featured Product campaign types',
      enabledByDefault: false,
      dependencies: [],
    },
  });

  console.log(`Created flag: ${flag.key}`);

  // Create default rules for all environments (OFF by default)
  const environments = ['dev', 'staging', 'prod'];
  
  for (const env of environments) {
    await prisma.flagRule.upsert({
      where: {
        flagId_environment: {
          flagId: flag.id,
          environment: env,
        },
      },
      update: {},
      create: {
        flagId: flag.id,
        environment: env,
        status: 'OFF',
        rolloutPct: 0,
        priority: 0,
      },
    });
  }

  console.log('Created default rules for all environments (OFF)');
}

async function main() {
  try {
    await seedPromotionsExtendedFlag();
    console.log('✅ Promotions extended flag seeded successfully');
  } catch (error) {
    console.error('❌ Error seeding promotions extended flag:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
