/** Seeded Keycloak accounts for local / demo login (see apps/api/scripts seed:*). */

export type DemoLoginAccount = {
  role: string
  label?: string
  email: string
  password: string
  group: 'core' | 'plan-tier' | 'prodlike-restaurant' | 'prodlike-supplier'
}

const PRODLIKE_PASSWORD = 'Supplify1!'

export const DEMO_LOGIN_GROUPS = [
  { id: 'core' as const, title: 'Core demo', description: 'Golden Fork, Fresh Foods, admin' },
  {
    id: 'plan-tier' as const,
    title: 'Plan tiers',
    description: 'Free / Silver (Bronze) / Gold — password Supplify1!',
  },
  {
    id: 'prodlike-restaurant' as const,
    title: 'Prod-like restaurants',
    description: 'Restaurant 1–10',
  },
  { id: 'prodlike-supplier' as const, title: 'Prod-like suppliers', description: 'Supplier 0–49' },
]

export const DEMO_LOGIN_ACCOUNTS: DemoLoginAccount[] = [
  {
    group: 'core',
    role: 'Admin',
    email: 'admin@supplify.com',
    password: 'SupplifyAdmin1!',
  },
  {
    group: 'core',
    role: 'Supplier',
    label: 'Fresh Foods (demo)',
    email: 'supplier@supplify.com',
    password: 'SupplifySupplier1!',
  },
  {
    group: 'core',
    role: 'Restaurant',
    label: 'Golden Fork (demo)',
    email: 'restaurant@supplify.com',
    password: 'SupplifyRestaurant1!',
  },
  {
    group: 'plan-tier',
    role: 'Restaurant',
    label: 'Free plan',
    email: 'restaurant-free@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  {
    group: 'plan-tier',
    role: 'Restaurant',
    label: 'Silver tier (Bronze plan)',
    email: 'restaurant-silver@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  {
    group: 'plan-tier',
    role: 'Restaurant',
    label: 'Gold plan',
    email: 'restaurant-gold@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  {
    group: 'plan-tier',
    role: 'Supplier',
    label: 'Free plan',
    email: 'supplier-free@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  {
    group: 'plan-tier',
    role: 'Supplier',
    label: 'Silver tier (Bronze plan)',
    email: 'supplier-silver@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  {
    group: 'plan-tier',
    role: 'Supplier',
    label: 'Gold plan',
    email: 'supplier-gold@supplify.com',
    password: PRODLIKE_PASSWORD,
  },
  ...Array.from({ length: 10 }, (_, i) => ({
    group: 'prodlike-restaurant' as const,
    role: 'Restaurant',
    label: `Restaurant ${i + 1}`,
    email: `restaurant-${i + 1}@test.com`,
    password: PRODLIKE_PASSWORD,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    group: 'prodlike-supplier' as const,
    role: 'Supplier',
    label: `Supplier ${i}`,
    email: `contact-${i}@supplier${i}.test`,
    password: PRODLIKE_PASSWORD,
  })),
]

export function accountsByGroup(group: DemoLoginAccount['group']) {
  return DEMO_LOGIN_ACCOUNTS.filter((a) => a.group === group)
}
