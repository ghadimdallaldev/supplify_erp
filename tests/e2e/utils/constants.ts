/**
 * Test user credentials (Keycloak demo accounts). Must exist in Keycloak when running E2E with auth.
 * See docs/SETUP.md and seed:demo-users.
 */
export const TEST_USERS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'supplifyadmin@supplify.com',
    password: process.env.E2E_ADMIN_PASSWORD || 'Supplify2025!',
    role: 'ADMIN' as const,
  },
  restaurant: {
    email: process.env.E2E_RESTAURANT_EMAIL || 'restaurant-1@test.com',
    password: process.env.E2E_RESTAURANT_PASSWORD || 'Supplify1!',
    role: 'RESTAURANT' as const,
  },
  supplier: {
    email: process.env.E2E_SUPPLIER_EMAIL || 'contact-0@supplier0.test',
    password: process.env.E2E_SUPPLIER_PASSWORD || 'Supplify1!',
    role: 'SUPPLIER' as const,
  },
} as const

export const AUTH_STORAGE_PATHS = {
  admin: 'e2e/.auth/admin.json',
  restaurant: 'e2e/.auth/restaurant.json',
  supplier: 'e2e/.auth/supplier.json',
} as const
