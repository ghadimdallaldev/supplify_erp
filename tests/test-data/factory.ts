/**
 * Test data factory: deterministic IDs and helpers for E2E/API tests.
 * Use with seeded data from: pnpm db:migrate && pnpm db:seed && pnpm seed:prodlike && pnpm seed:demo-users
 */

export const TEST_ORG_IDS = {
  restaurant: process.env.E2E_RESTAURANT_ORG_ID || '550e8400-e29b-41d4-a716-446655440002',
  supplier: process.env.E2E_SUPPLIER_ORG_ID || '550e8400-e29b-41d4-a716-446655440001',
} as const

/** Order ID used by E2E reset-seed for orders_basic and orders_delivered. */
export const E2E_ORDER_ID = 'e2e00001-0001-4001-8001-000000000001'

export const DEMO_USER_EMAILS = {
  admin: process.env.E2E_ADMIN_EMAIL || 'supplifyadmin@supplify.com',
  restaurant: process.env.E2E_RESTAURANT_EMAIL || 'restaurant@supplify.com',
  supplier: process.env.E2E_SUPPLIER_EMAIL || 'supplier@supplify.com',
} as const

export interface SeededData {
  restaurantId: string
  supplierId: string
  productIds: string[]
  orderIds: string[]
}

/**
 * Placeholder for IDs after seed. In CI/local, run seed script then set env or read from seed output.
 */
export function getSeededData(): SeededData {
  return {
    restaurantId: TEST_ORG_IDS.restaurant,
    supplierId: TEST_ORG_IDS.supplier,
    productIds: [],
    orderIds: [],
  }
}
