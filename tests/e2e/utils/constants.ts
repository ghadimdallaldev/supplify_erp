/**
 * Test user credentials (Keycloak demo accounts). Must exist in Keycloak when running E2E with auth.
 * See docs/SETUP.md and seed:demo-users.
 */
/** Align with seed:demo-users and reduce-to-single-tenant: 1 admin, 1 restaurant, 1 supplier. */
export const TEST_USERS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'admin@supplify.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'SupplifyAdmin1!',
    role: 'ADMIN' as const,
  },
  restaurant: {
    email: process.env.E2E_RESTAURANT_EMAIL || 'restaurant@supplify.com',
    password: process.env.E2E_RESTAURANT_PASSWORD || 'SupplifyRestaurant1!',
    role: 'RESTAURANT' as const,
  },
  supplier: {
    email: process.env.E2E_SUPPLIER_EMAIL || 'supplier@supplify.com',
    password: process.env.E2E_SUPPLIER_PASSWORD || 'SupplifySupplier1!',
    role: 'SUPPLIER' as const,
  },
} as const

export const AUTH_STORAGE_PATHS = {
  admin: 'e2e/.auth/admin.json',
  restaurant: 'e2e/.auth/restaurant.json',
  supplier: 'e2e/.auth/supplier.json',
} as const
