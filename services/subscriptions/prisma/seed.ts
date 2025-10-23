import { PrismaClient } from '@prisma/client';
import { addDays } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Entitlements structure for subscription plans
 */
interface Entitlements {
  features: {
    analyticsAdvanced: boolean;
    promotions: boolean;
    recommendationsBoost: boolean;
    loyaltyAdvanced: boolean;
    apiAccess: boolean;
    webhooks: boolean;
    inventoryModule: boolean;
    pinnedProducts: boolean;
    prioritySupport: boolean;
  };
  limits: {
    products: number;
    promotionsActive: number;
    pinnedPerSupplier: number;
    favoriteLists: number;
    users: number;
    apiRateRps: number;
    storageGB: number;
  };
}

/**
 * Seed subscription plans
 */
async function seedPlans() {
  console.log('🌱 Seeding subscription plans...');

  // Clean existing data
  await prisma.subscriptionEvent.deleteMany();
  await prisma.orgSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();

  // BASIC Plan
  const basicEntitlements: Entitlements = {
    features: {
      analyticsAdvanced: false,
      promotions: false,
      recommendationsBoost: false,
      loyaltyAdvanced: false,
      apiAccess: false,
      webhooks: false,
      inventoryModule: false,
      pinnedProducts: true, // Always true, but limit varies
      prioritySupport: false,
    },
    limits: {
      products: 500,
      promotionsActive: 0,
      pinnedPerSupplier: 20,
      favoriteLists: 5,
      users: 3,
      apiRateRps: 2,
      storageGB: 5,
    },
  };

  const basicPlan = await prisma.subscriptionPlan.create({
    data: {
      code: 'BASIC',
      name: 'Basic',
      description: 'Core catalog & orders with limited analytics. Perfect for getting started.',
      isActive: true,
      entitlements: basicEntitlements as any,
    },
  });

  console.log('✅ Created BASIC plan');

  // PRO Plan
  const proEntitlements: Entitlements = {
    features: {
      analyticsAdvanced: true,
      promotions: true,
      recommendationsBoost: true,
      loyaltyAdvanced: false,
      apiAccess: false,
      webhooks: false,
      inventoryModule: true,
      pinnedProducts: true,
      prioritySupport: false,
    },
    limits: {
      products: 5000,
      promotionsActive: 5,
      pinnedPerSupplier: 100,
      favoriteLists: 50,
      users: 10,
      apiRateRps: 5,
      storageGB: 50,
    },
  };

  const proPlan = await prisma.subscriptionPlan.create({
    data: {
      code: 'PRO',
      name: 'Pro',
      description: 'Advanced features including promotions, inventory management, and powerful analytics.',
      isActive: true,
      entitlements: proEntitlements as any,
    },
  });

  console.log('✅ Created PRO plan');

  // PREMIUM Plan
  const premiumEntitlements: Entitlements = {
    features: {
      analyticsAdvanced: true,
      promotions: true,
      recommendationsBoost: true,
      loyaltyAdvanced: true,
      apiAccess: true,
      webhooks: true,
      inventoryModule: true,
      pinnedProducts: true,
      prioritySupport: true,
    },
    limits: {
      products: 50000,
      promotionsActive: 50,
      pinnedPerSupplier: 500,
      favoriteLists: 200,
      users: 100,
      apiRateRps: 25,
      storageGB: 500,
    },
  };

  const premiumPlan = await prisma.subscriptionPlan.create({
    data: {
      code: 'PREMIUM',
      name: 'Premium',
      description: 'All features unlocked with highest limits, API access, webhooks, and priority support.',
      isActive: true,
      entitlements: premiumEntitlements as any,
    },
  });

  console.log('✅ Created PREMIUM plan');

  // Create demo org subscriptions
  console.log('\n🌱 Seeding demo org subscriptions...');

  // Supplier 1: BASIC tier
  const supplier1Sub = await prisma.orgSubscription.create({
    data: {
      orgId: 'sup-sysco-001',
      orgType: 'SUPPLIER',
      planId: basicPlan.id,
      planCode: 'BASIC',
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: null,
      trialEndsAt: null,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      orgId: 'sup-sysco-001',
      orgType: 'SUPPLIER',
      eventType: 'ASSIGNED',
      newPlan: 'BASIC',
      newStatus: 'ACTIVE',
      changedBy: 'seed-script',
      metadata: { source: 'seed' },
    },
  });

  console.log('✅ Assigned BASIC to sup-sysco-001');

  // Supplier 2: PRO tier with trial
  const trialEnds = addDays(new Date(), 27); // 27 days left in trial

  const supplier2Sub = await prisma.orgSubscription.create({
    data: {
      orgId: 'sup-usfoods-001',
      orgType: 'SUPPLIER',
      planId: proPlan.id,
      planCode: 'PRO',
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: null,
      trialEndsAt: trialEnds,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      orgId: 'sup-usfoods-001',
      orgType: 'SUPPLIER',
      eventType: 'ASSIGNED',
      newPlan: 'PRO',
      newStatus: 'ACTIVE',
      changedBy: 'seed-script',
      metadata: { source: 'seed', trial: true },
    },
  });

  console.log('✅ Assigned PRO (trial) to sup-usfoods-001');

  // Restaurant 1: BASIC tier
  const restaurant1Sub = await prisma.orgSubscription.create({
    data: {
      orgId: 'rest-demo-001',
      orgType: 'RESTAURANT',
      planId: basicPlan.id,
      planCode: 'BASIC',
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: null,
      trialEndsAt: null,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      orgId: 'rest-demo-001',
      orgType: 'RESTAURANT',
      eventType: 'ASSIGNED',
      newPlan: 'BASIC',
      newStatus: 'ACTIVE',
      changedBy: 'seed-script',
      metadata: { source: 'seed' },
    },
  });

  console.log('✅ Assigned BASIC to rest-demo-001');

  // Restaurant 2: PREMIUM tier
  const restaurant2Sub = await prisma.orgSubscription.create({
    data: {
      orgId: 'rest-premium-001',
      orgType: 'RESTAURANT',
      planId: premiumPlan.id,
      planCode: 'PREMIUM',
      status: 'ACTIVE',
      startsAt: new Date(),
      endsAt: null,
      trialEndsAt: null,
    },
  });

  await prisma.subscriptionEvent.create({
    data: {
      orgId: 'rest-premium-001',
      orgType: 'RESTAURANT',
      eventType: 'ASSIGNED',
      newPlan: 'PREMIUM',
      newStatus: 'ACTIVE',
      changedBy: 'seed-script',
      metadata: { source: 'seed' },
    },
  });

  console.log('✅ Assigned PREMIUM to rest-premium-001');

  console.log('\n📊 Seed Summary:');
  console.log('  Plans: 3 (BASIC, PRO, PREMIUM)');
  console.log('  Org Subscriptions: 4 (2 suppliers, 2 restaurants)');
  console.log('  Events: 4');
  console.log('\n✨ Subscription system ready!');
}

seedPlans()
  .catch((e) => {
    console.error('Error seeding subscriptions:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

