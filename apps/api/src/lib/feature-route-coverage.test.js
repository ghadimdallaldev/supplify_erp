/**
 * Every router mounted in server.js must either be behind an admin-toggleable feature flag
 * (global + per-account via Admin → Features) or be explicitly exempt with a reason.
 *
 * Adding a new router without classifying it here fails this test — that is the point.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADMIN_GLOBAL_FEATURE_KEYS,
  DEFAULT_ON_FEATURE_KEYS,
  featureDisplayName,
} from './feature-keys.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(here, '..')
const serverSource = fs.readFileSync(path.join(srcDir, 'server.js'), 'utf8')

/** ident → feature keys that must be enforced somewhere in the router's source. */
const GATED = {
  productsRoutes: ['product_catalog'],
  pricesRoutes: ['product_catalog'],
  searchRoutes: ['global_search'],
  inventoryRoutes: ['stock_levels', 'inventory_management'],
  suppliersRoutes: [
    'supplier_directory',
    'supplier_following',
    'price_comparison',
    'featured_placement',
    'custom_branding',
  ],
  restaurantsRoutes: ['customer_directory', 'delivery_locations', 'custom_branding'],
  ordersCalendarRoutes: ['order_calendar'],
  ordersRoutes: [
    'order_management',
    'ordering',
    'order_warehouse_dispatch',
    'packing_slips',
    'order_reminders',
    'delivery_tracking',
    'fulfillment',
    'order_amendments',
  ],
  promotionsRoutes: ['promotions', 'supplier_deals'],
  tenantAuditRoutes: ['tenant_audit_log'],
  disputesRoutes: ['disputes_returns'],
  creditNotesRoutes: ['disputes_returns'],
  pushRoutes: ['push_notifications', 'web_push'],
  reviewsRoutes: ['supplier_reviews', 'supplier_reviews_read'],
  consumerReviewsRoutes: ['consumer_reviews'],
  reportsRoutes: ['reports'],
  tenantRolesRoutes: ['advanced_roles'],
  chatRoutes: ['chat'],
  assistantRoutes: ['ai_assistant'],
  invoicesRoutes: ['finance_invoices'],
  paymentsRoutes: ['finance_invoices'],
  quickListsRoutes: ['quick_lists'],
  restaurantInventoryRoutes: ['inventory_management'],
  receivingRoutes: ['receiving_quality'],
  restaurantFinanceRoutes: ['finance_invoices'],
  reservationsRoutes: ['reservations'],
  recipesRoutes: ['recipe_costing'],
  recipeCostingRoutes: ['recipe_costing'],
  restaurantPricingRoutes: ['contract_pricing'],
  restaurantIntelligenceRoutes: ['intelligence'],
  notificationsRoutes: ['notification_center'],
  branchesRoutes: ['branch_management', 'multi_branch'],
  orgRoutes: ['branch_management', 'multi_branch'],
  restaurantOrgRoutes: ['branch_management', 'multi_branch'],
  warehousesRoutes: ['warehouses'],
  staffRoutes: ['staff_management'],
  publicRoutes: ['reservations', 'staff_management', 'public_profile'],
  demoCampaignRoutes: ['demo_campaign'],
  publicSalesRoutes: ['public_sales'],
  supplierPublicSalesRoutes: ['public_sales'],
  fulfillmentRoutes: ['fulfillment'],
  driverTrackingRoutes: ['fulfillment'],
  driversRoutes: ['driver_management'],
  supplierOpsRoutes: [
    'ops_dashboard',
    'catalog_import',
    'product_substitutes',
    'fulfillment_issues',
    'finance_invoices',
    'promotions',
  ],
  supplierGrowthRoutes: ['supplier_growth'],
  restaurantConnectionRequestRoutes: ['supplier_connections'],
  branchInvitationsRoutes: ['team_invitations'],
  restaurantInvitationsRoutes: ['team_invitations', 'multi_branch'],
  quoteRequestsRoutes: ['quote_requests'],
  loyaltyRoutes: ['loyalty'],
  consumerRoutes: ['consumer_storefront'],
  consumerPublicRoutes: ['consumer_storefront'],
  registerRoutes: ['public_registration'],
  billingRoutes: ['self_serve_billing'],
  accountRoutes: ['organization_lifecycle'],
  consumerAccountRoutes: ['consumer_accounts'],
  branchInvitationsPublicRoutes: ['invitation_acceptance'],
  restaurantOnboardingRoutes: ['restaurant_profile'],
  growthPublicRoutes: ['referral_landing'],
  whatsappWebhookRoutes: ['whatsapp_ordering'],
}

/** ident → why it is not a toggleable feature. */
const EXEMPT = {
  authRoutes: 'login/session — the mechanism users need to reach any flag-controlled feature',
  filesRoutes: 'upload/download plumbing shared by every (already gated) feature',
  adminRoutes: 'platform admin surface — must stay reachable to manage flags (no lockout)',
  adminDashboardRoutes: 'hosts Admin → Features itself — gating it could lock admins out',
  subscriptionsRoutes: 'serves the resolved feature map that clients use to apply flags',
  e2eRoutes: 'test-only, never mounted in production',
  internalAuthRoutes: 'service-to-service auth, not a user feature',
  stripeWebhookRoutes: 'payment provider webhook — must always reconcile money movements',
}

/** Routers whose sub-routers live outside their own file/directory. */
const EXTRA_SOURCES = {
  ordersRoutes: ['routes/orders-driver.routes.js', 'routes/order-amendments.routes.js'],
}

const GATE_FNS =
  'tenantFeatureGate|publicTenantFeatureGate|platformFeatureGate|requireFeature|isFeatureEnabled|isFeatureEnabledForTenant|requireIntelligenceTier|hasFeature'

function mountedRouterIdents() {
  const idents = new Set()
  const re = /app\.use\(\s*'[^']+'\s*,(?:[^()]|\([^()]*\))*?\b([A-Za-z]+Routes)\s*\)/g
  for (const m of serverSource.matchAll(re)) idents.add(m[1])
  return [...idents]
}

function importPathFor(ident) {
  const re = new RegExp(
    `import\\s+(?:\\{[^}]*\\b${ident}\\b[^}]*\\}|${ident})\\s+from\\s+'(\\./routes/[^']+)'`
  )
  const m = serverSource.match(re)
  return m ? path.join(srcDir, m[1]) : null
}

function collectSource(file, ident) {
  const files = [file, ...(EXTRA_SOURCES[ident] || []).map((f) => path.join(srcDir, f))]
  const dir = file.endsWith('index.js')
    ? path.dirname(file)
    : file.replace(/\.routes\.js$/, '').replace(/\.js$/, '')
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.js') && !f.endsWith('.test.js')) files.push(path.join(dir, f))
    }
  }
  return files
    .filter((f) => fs.existsSync(f))
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n')
}

function enforcesKey(source, key) {
  if (key === 'intelligence') return /requireIntelligenceTier\(/.test(source)
  const re = new RegExp(`(?:${GATE_FNS})\\(\\s*\\[?\\s*['"]${key}['"]`)
  return re.test(source)
}

describe('feature flag route coverage', () => {
  const idents = mountedRouterIdents()

  it('finds the mounted routers', () => {
    expect(idents.length).toBeGreaterThan(50)
  })

  it('classifies every mounted router as gated or exempt', () => {
    const unclassified = idents.filter((i) => !(i in GATED) && !(i in EXEMPT))
    expect(
      unclassified,
      'add these to GATED (with a feature key) or EXEMPT (with a reason)'
    ).toEqual([])
  })

  it.each(Object.entries(GATED))('%s enforces its feature keys', (ident, keys) => {
    const file = importPathFor(ident)
    expect(file, `import for ${ident} not found in server.js`).toBeTruthy()
    const source = collectSource(file, ident)
    for (const key of keys) {
      if (key !== 'intelligence') {
        expect(ADMIN_GLOBAL_FEATURE_KEYS, `${key} must be admin-toggleable`).toContain(key)
      }
      expect(enforcesKey(source, key), `${ident} does not gate on "${key}"`).toBe(true)
    }
  })

  it('every default-on key is enforced by at least one router and has a display name', () => {
    const all = Object.keys(GATED)
      .map((ident) => collectSource(importPathFor(ident), ident))
      .join('\n')
    for (const key of DEFAULT_ON_FEATURE_KEYS) {
      expect(featureDisplayName(key)).not.toBe(key)
      expect(enforcesKey(all, key), `default-on key "${key}" is never enforced`).toBe(true)
    }
  })
})
