import { hasPermission } from './permissions.js'
import { rolesIncludeOwner } from './tenant-roles.js'

export function canViewSupplierSummaryFinance(req) {
  return (
    rolesIncludeOwner(req.tenantContext?.roles) ||
    hasPermission(
      req.tenantContext?.permissions ?? req.adminContext?.permissions ?? [],
      'INVOICES_VIEW'
    )
  )
}

function withoutFinancePriorities(priorities) {
  return (priorities ?? []).filter(
    (item) => item.type !== 'finance' && item.id !== 'overdue-invoices'
  )
}

function withoutFinanceKpis(kpis) {
  return { ...kpis, unpaidBalance: null, overdueBalance: null }
}

/** Project after the tenant-wide cache read; never mutate the cached payload. */
export function projectSupplierCommandCenterFinance(data, allowed) {
  if (allowed) return data
  return {
    ...data,
    kpis: withoutFinanceKpis(data.kpis),
    todaysPriorities: withoutFinancePriorities(data.todaysPriorities),
    needsAttention: withoutFinancePriorities(data.needsAttention),
    previews: { ...data.previews, receivables: null },
  }
}

export function projectSupplierRunSheetFinance(data, allowed) {
  if (allowed) return data
  return {
    ...data,
    summary: {
      ...data.summary,
      kpis: withoutFinanceKpis(data.summary?.kpis),
      todaysPriorities: withoutFinancePriorities(data.summary?.todaysPriorities),
      receivablesByCurrency: [],
    },
    receivablesDueToday: {
      summary: {
        count: 0,
        totalBalanceDue: null,
        byCurrency: [],
        dueTodayCount: 0,
        overdueCount: 0,
      },
      invoices: [],
    },
  }
}
