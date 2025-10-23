import { PrismaClient, RuleStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed base feature flags for Supplify
 */
async function seedFlags() {
  console.log('🚩 Seeding feature flags...');

  // Clean existing data
  await prisma.flagEvaluation.deleteMany();
  await prisma.flagAudit.deleteMany();
  await prisma.flagOverride.deleteMany();
  await prisma.flagRule.deleteMany();
  await prisma.featureFlag.deleteMany();

  // ========== Base Feature Flags ==========
  console.log('Creating base feature flags...');

  const flags = [
    {
      key: 'inventory',
      name: 'Inventory Management',
      description: 'Real-time stock tracking, FEFO, cycle counts, and recipe depletion',
      enabledByDefault: false,
      dependencies: [],
    },
    {
      key: 'sponsoredAds',
      name: 'Sponsored Visibility',
      description: 'Paid promotions for suppliers with CPM/CPC billing',
      enabledByDefault: false,
      dependencies: [],
    },
    {
      key: 'loyalty',
      name: 'Loyalty Programs',
      description: 'Customer loyalty points and rewards',
      enabledByDefault: false,
      dependencies: [],
    },
    {
      key: 'recommendations',
      name: 'Smart Recommendations',
      description: 'ML-powered product and supplier recommendations',
      enabledByDefault: true, // Core feature
      dependencies: [],
    },
    {
      key: 'subscriptions',
      name: 'Subscription Tiers',
      description: 'Basic/Pro/Premium tier system with feature gating',
      enabledByDefault: true, // Core monetization
      dependencies: [],
    },
    {
      key: 'payments',
      name: 'Payment Processing',
      description: 'Stripe integration for supplier payments',
      enabledByDefault: false,
      dependencies: ['subscriptions'], // Requires tiers to be active
    },
    {
      key: 'posIntegrations',
      name: 'POS Integrations',
      description: 'Point-of-sale system integrations',
      enabledByDefault: false,
      dependencies: ['inventory'], // Requires inventory for sync
    },
    {
      key: 'bnpl',
      name: 'Buy Now Pay Later',
      description: 'Financing options for restaurants',
      enabledByDefault: false,
      dependencies: ['payments'],
    },
    {
      key: 'logistics',
      name: 'Logistics & Delivery Tracking',
      description: 'Real-time delivery tracking and route optimization',
      enabledByDefault: false,
      dependencies: [],
    },
    {
      key: 'communityFeed',
      name: 'Community Feed',
      description: 'Social features for restaurant community',
      enabledByDefault: false,
      dependencies: [],
    },
    {
      key: 'excessMarketplace',
      name: 'Excess Inventory Marketplace',
      description: 'Buy/sell excess inventory between restaurants',
      enabledByDefault: false,
      dependencies: ['inventory'],
    },
    {
      key: 'apiAccess',
      name: 'API Access',
      description: 'RESTful API access for integrations',
      enabledByDefault: false,
      dependencies: ['subscriptions'], // Premium feature
    },
    {
      key: 'webhooks',
      name: 'Webhooks',
      description: 'Event webhooks for external systems',
      enabledByDefault: false,
      dependencies: ['apiAccess'],
    },
  ];

  const createdFlags = [];
  for (const flagData of flags) {
    const flag = await prisma.featureFlag.create({
      data: flagData,
    });
    createdFlags.push(flag);
    console.log(`  ✓ Created flag: ${flag.key}`);
  }

  // ========== Rules for Different Environments ==========
  console.log('\nCreating flag rules...');

  const inventoryFlag = createdFlags.find(f => f.key === 'inventory');
  const sponsoredAdsFlag = createdFlags.find(f => f.key === 'sponsoredAds');
  const loyaltyFlag = createdFlags.find(f => f.key === 'loyalty');

  if (inventoryFlag) {
    // Dev: ON for all
    await prisma.flagRule.create({
      data: {
        flagId: inventoryFlag.id,
        environment: 'dev',
        status: RuleStatus.ON,
        priority: 0,
        createdBy: 'seed',
      },
    });

    // Staging: ON for all
    await prisma.flagRule.create({
      data: {
        flagId: inventoryFlag.id,
        environment: 'staging',
        status: RuleStatus.ON,
        priority: 0,
        createdBy: 'seed',
      },
    });

    // Prod: OFF (prelaunch)
    await prisma.flagRule.create({
      data: {
        flagId: inventoryFlag.id,
        environment: 'prod',
        status: RuleStatus.OFF,
        priority: 0,
        createdBy: 'seed',
      },
    });

    console.log('  ✓ Created rules for inventory (dev/staging ON, prod OFF)');
  }

  if (sponsoredAdsFlag) {
    // Dev/Staging: ON
    await prisma.flagRule.createMany({
      data: [
        {
          flagId: sponsoredAdsFlag.id,
          environment: 'dev',
          status: RuleStatus.ON,
          priority: 0,
          createdBy: 'seed',
        },
        {
          flagId: sponsoredAdsFlag.id,
          environment: 'staging',
          status: RuleStatus.ON,
          priority: 0,
          createdBy: 'seed',
        },
      ],
    });

    // Prod: ROLLOUT 10% to SUPPLIER only
    await prisma.flagRule.create({
      data: {
        flagId: sponsoredAdsFlag.id,
        environment: 'prod',
        status: RuleStatus.ROLLOUT,
        rolloutPct: 10,
        targetOrgType: 'SUPPLIER',
        priority: 0,
        createdBy: 'seed',
      },
    });

    console.log('  ✓ Created rules for sponsoredAds (prod 10% rollout to suppliers)');
  }

  if (loyaltyFlag) {
    // All envs: OFF (future feature)
    await prisma.flagRule.createMany({
      data: [
        {
          flagId: loyaltyFlag.id,
          environment: 'dev',
          status: RuleStatus.OFF,
          priority: 0,
          createdBy: 'seed',
        },
        {
          flagId: loyaltyFlag.id,
          environment: 'staging',
          status: RuleStatus.OFF,
          priority: 0,
          createdBy: 'seed',
        },
        {
          flagId: loyaltyFlag.id,
          environment: 'prod',
          status: RuleStatus.OFF,
          priority: 0,
          createdBy: 'seed',
        },
      ],
    });

    console.log('  ✓ Created rules for loyalty (all OFF - future feature)');
  }

  // ========== Example Override ==========
  console.log('\nCreating example override...');

  if (inventoryFlag) {
    // Force inventory ON for a specific demo restaurant in prod
    await prisma.flagOverride.create({
      data: {
        flagId: inventoryFlag.id,
        environment: 'prod',
        orgType: 'RESTAURANT',
        orgId: 'rest-demo-001',
        forcedStatus: 'FORCE_ON',
        note: 'Demo restaurant - early access',
        createdBy: 'seed',
      },
    });

    console.log('  ✓ Created override for rest-demo-001 (inventory FORCE_ON in prod)');
  }

  // ========== Summary ==========
  console.log('\n✨ Seed complete!');
  console.log(`  Flags: ${createdFlags.length}`);
  console.log(`  Rules: ${await prisma.flagRule.count()}`);
  console.log(`  Overrides: ${await prisma.flagOverride.count()}`);
  console.log('\n📋 Key Flags:');
  console.log('  - inventory: OFF in prod, ON in dev/staging');
  console.log('  - sponsoredAds: 10% rollout in prod (suppliers only)');
  console.log('  - loyalty: OFF everywhere (future)');
  console.log('  - subscriptions: Default ON (core feature)');
}

seedFlags()
  .catch((e) => {
    console.error('Error seeding flags:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

