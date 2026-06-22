/**
 * One-shot codemod: add useTranslation('admin') and replace known string literals.
 * Run: node scripts/migrate-admin-components.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const adminDir = path.join(__dirname, '../src/components/admin')

const REPLACEMENTS = [
  ['title="System health"', "title={t('health.title')}"],
  ['description="Subscription health, infrastructure metrics, and recent API or email failures."', "description={t('health.description')}"],
  ['label="Loading health metrics…"', "label={t('health.loading')}"],
  ['title="Subscription health metrics unavailable"', "title={t('health.subscriptionUnavailableTitle')}"],
  ['message="Overview metrics failed to load. Infrastructure checks below may still apply."', "message={t('health.subscriptionUnavailableMessage')}"],
  ['title="Health checks unavailable"', "title={t('health.checksUnavailableTitle')}"],
  ["|| 'The health API request failed.'", "|| t('health.healthApiFailed')"],
  ['title="Database pool"', "title={t('health.dbPoolTitle')}"],
  ['title="Pool metrics unavailable"', "title={t('health.poolMetricsUnavailableTitle')}"],
  ['description="Database pool stats are not exposed in this environment."', "description={t('health.poolMetricsUnavailableDescription')}"],
  ['title="Email failures (24h)"', "title={t('health.emailFailuresTitle')}"],
  ['aria-label="Recent email failures"', "aria-label={t('health.emailFailuresTableAriaLabel')}"],
  ['title="Recent API errors"', "title={t('health.apiErrorsTitle')}"],
  ['placeholder="Search method, status, source, tenant, or message…"', "placeholder={t('health.searchPlaceholder')}"],
  ['aria-label="Search API errors"', "aria-label={t('health.searchAriaLabel')}"],
  ['title="No errors match your search"', "title={t('health.noSearchMatchTitle')}"],
  ['description="Try a different keyword or clear the filter."', "description={t('health.noSearchMatchDescription')}"],
  ['aria-label="Recent API errors"', "aria-label={t('health.apiErrorsTableAriaLabel')}"],
  ['title="Deals & Boosts"', "title={t('deals.title')}"],
  ['description="Review supplier deals (offers and discounts), boost purchases (paid sponsored placement), and platform-wide deal insights."', "description={t('deals.description')}"],
  ['placeholder="All statuses"', "placeholder={t('common.allStatuses')}"],
  ['placeholder="All types"', "placeholder={t('common.allTypes')}"],
  ['placeholder="Title or supplier…"', "placeholder={t('deals.searchPlaceholder')}"],
  ['label="Loading deals…"', "label={t('deals.loading')}"],
  ['aria-label="Expand row"', "aria-label={t('common.expandRowAriaLabel')}"],
  ['label="Deal"', "label={t('common.table.deal')}"],
  ['label="Supplier"', "label={t('common.table.supplier')}"],
  ['label="Type"', "label={t('common.table.type')}"],
  ['label="Status"', "label={t('common.table.status')}"],
  ['label="Start"', "label={t('common.table.start')}"],
  ['label="End"', "label={t('common.table.end')}"],
  ['label="Created"', "label={t('common.table.created')}"],
  ['placeholder="Optional reason shown to supplier"', "placeholder={t('deals.rejectionReasonPlaceholder')}"],
  ['title="Operations"', "title={t('operations.title')}"],
  ['description="Email, inventory expiry, reorder cadence, fulfillment issues, and GPS delivery health (read-only)"', "description={t('operations.description')}"],
  ['title="Overview"', "title={t('overview.title')}"],
  ['description="Platform health, tenant growth, and operational metrics."', "description={t('overview.description')}"],
  ['title="Could not load dashboard metrics"', "title={t('overview.loadFailedTitle')}"],
  ['title="Subscriptions"', "title={t('subscriptions.title')}"],
  ['description="Review tenant plans, activation state, and billing status across the platform."', "description={t('subscriptions.description')}"],
  ['placeholder="Search tenant, email, or plan…"', "placeholder={t('subscriptions.searchPlaceholder')}"],
  ['aria-label="Search subscriptions"', "aria-label={t('subscriptions.searchAriaLabel')}"],
  ['aria-label="Filter by status"', "aria-label={t('subscriptions.filterStatusAriaLabel')}"],
  ['aria-label="Filter by tenant type"', "aria-label={t('subscriptions.filterTenantTypeAriaLabel')}"],
  ['title="Platform users"', "title={t('users.platformUsers')}"],
  ['title="Limits & add-ons"', "title={t('limits.title')}"],
  ['description="Review plan limits vs usage, grant branch/warehouse add-ons, and manage plan or tenant overrides."', "description={t('limits.description')}"],
  ['title="Support conversations"', "title={t('supportChat.title')}"],
  ['title="All clear"', "title={t('attention.allClearTitle')}"],
  ['description="All clear. No critical platform issues right now."', "description={t('attention.allClearDescription')}"],
  ['title="Could not load activity"', "title={t('activity.recent.loadFailedTitle')}"],
  ["|| 'The activity feed failed to load.'", "|| t('activity.recent.loadFailedMessage')"],
  ['title="No recent platform activity yet"', "title={t('activity.recent.emptyTitle')}"],
  ['description="Platform events will appear here as tenants use the system."', "description={t('activity.recent.emptyDescription')}"],
  ['title="Operations snapshot"', "title={t('operationsSnapshot.title')}"],
  ['description="Daily platform activity and operational health"', "description={t('operationsSnapshot.description')}"],
  ['title="No tenants under pressure"', "title={t('usage.noTenantsUnderPressureTitle')}"],
  ['description="No loaded tenants are near or over plan limits. Load more tenants or check back later."', "description={t('usage.noTenantsUnderPressureDescription')}"],
  ['aria-label="Tenants under usage pressure"', "aria-label={t('usage.pressureTableAriaLabel')}"],
  ['title="Tenants under pressure"', "title={t('usage.tenantsUnderPressure')}"],
  ['title="Reset password"', "title={t('resetPassword.title')}"],
  ['>Refresh<', ">{t('common.refresh')}<"],
  ['>Clear filters<', ">{t('common.clearFilters')}<"],
  ['>Clear search<', ">{t('common.clearSearch')}<"],
  ['>Cancel<', ">{t('common.cancel')}<"],
  ['>Done<', ">{t('common.done')}<"],
  ['>Retry<', ">{t('common.retry')}<"],
  ['>Actions<', ">{t('common.table.actions')}<"],
  ['>User<', ">{t('common.table.user')}<"],
  ['>Role<', ">{t('common.table.role')}<"],
  ['>Time<', ">{t('common.table.time')}<"],
  ['>Plan<', ">{t('common.table.plan')}<"],
  ['>Status<', ">{t('common.table.status')}<"],
  ['>Tenant<', ">{t('common.table.tenant')}<"],
  ['>Actions<', ">{t('common.table.actions')}<"],
  ['>Restaurant<', ">{t('common.restaurant')}<"],
  ['>Supplier<', ">{t('common.supplier')}<"],
  ['>All statuses<', ">{t('common.allStatuses')}<"],
  ['>All tenant types<', ">{t('common.allTenantTypes')}<"],
  ['>All action types<', ">{t('common.allActionTypes')}<"],
  ['>All plans<', ">{t('common.allPlans')}<"],
  ['>Not available<', ">{t('common.notAvailable')}<"],
]

const SKIP = ['.test.', 'adminUi.tsx', 'AdminSidebar.tsx', 'AdminTopBar.tsx', 'AdminShell.tsx', 'AdminUsersTab.tsx', 'AdminActivityTab.tsx']

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.tsx') && !SKIP.some((s) => entry.name.includes(s))) out.push(full)
  }
  return out
}

function ensureTranslation(content, file) {
  if (content.includes("useTranslation('admin')")) return content
  if (!REPLACEMENTS.some(([from]) => content.includes(from.split('=')[0]?.replace(/[{}]/g, '') || from))) {
    return content
  }
  let updated = content
  if (!updated.includes("from 'react-i18next'")) {
    if (updated.includes("from 'react'")) {
      updated = updated.replace(
        /import \{([^}]+)\} from 'react'/,
        (m, imports) => {
          if (imports.includes('useTranslation')) return m
          return `import {${imports}} from 'react'\nimport { useTranslation } from 'react-i18next'`
        }
      )
    } else {
      updated = `import { useTranslation } from 'react-i18next'\n${updated}`
    }
  }
  const fnMatch = updated.match(/export function (\w+)/)
  if (fnMatch) {
    const fn = fnMatch[1]
    updated = updated.replace(
      new RegExp(`export function ${fn}\\([^)]*\\)\\s*\\{`),
      (m) => `${m}\n  const { t } = useTranslation('admin')`
    )
  }
  return updated
}

let changed = 0
for (const file of walk(adminDir)) {
  let content = fs.readFileSync(file, 'utf8')
  const original = content
  for (const [from, to] of REPLACEMENTS) {
    content = content.split(from).join(to)
  }
  content = ensureTranslation(content, file)
  if (content !== original) {
    fs.writeFileSync(file, content)
    changed++
    console.log('updated', path.relative(adminDir, file))
  }
}
console.log(`Done. ${changed} files updated.`)
