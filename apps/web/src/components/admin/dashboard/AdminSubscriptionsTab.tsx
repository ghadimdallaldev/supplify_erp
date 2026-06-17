import { useEffect, useMemo, useState } from 'react'
import { CreditCard, Filter, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Select, SelectTrigger } from '../../ui/select'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import { StatusBadge } from '../../ui/status-badge'
import {
  useGetAdminSubscriptionsQuery,
  useUnlockAdminSubscriptionMutation,
  useExtendAdminFreeTrialMutation,
} from '../../../services/api'
import { formatPlanDisplayName } from '../../../lib/planComparison'
import { toast } from 'sonner'
import {
  AdminEmptyState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
  formatAdminDate,
} from '../adminUi'
import { cn } from '../../../lib/utils'

export type AdminChangePlanTarget = {
  id: string
  tenant_type: 'RESTAURANT' | 'SUPPLIER'
  tenant_name?: string
}

type SubscriptionRow = {
  id: string
  tenant_id: string
  tenant_type: 'RESTAURANT' | 'SUPPLIER'
  tenant_name?: string
  tenant_email?: string
  plan_name: string
  plan_code?: string
  status: string
  created_at: string
  lock_reason?: string
  account_locked_at?: string
}

export interface AdminSubscriptionsTabProps {
  active: boolean
  onOpenChangePlan: (sub: AdminChangePlanTarget) => void
}

function tenantTypeTone(type: string): string {
  return type === 'SUPPLIER'
    ? 'bg-violet-50 text-violet-700 border-violet-200'
    : 'bg-sky-50 text-sky-800 border-sky-200'
}

function needsAttention(sub: SubscriptionRow): boolean {
  return Boolean(
    sub.account_locked_at ||
      sub.lock_reason === 'pending_activation' ||
      sub.lock_reason === 'free_sandbox_expired'
  )
}

export function AdminSubscriptionsTab({ active, onOpenChangePlan }: AdminSubscriptionsTabProps) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tenantTypeFilter, setTenantTypeFilter] = useState('all')
  const [attentionOnly, setAttentionOnly] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const {
    data: subscriptionsData,
    isLoading: subscriptionsLoading,
    isFetching: subscriptionsFetching,
    refetch: refetchSubscriptions,
  } = useGetAdminSubscriptionsQuery({}, { skip: !active })

  const [unlockSubscription, { isLoading: isUnlocking }] = useUnlockAdminSubscriptionMutation()
  const [extendFreeTrial, { isLoading: isExtendingTrial }] = useExtendAdminFreeTrialMutation()

  const subscriptions = useMemo(() => {
    const raw = subscriptionsData?.subscriptions ?? []
    return raw.filter(
      (s, i, arr) =>
        arr.findIndex((x) => x.tenant_id === s.tenant_id && x.tenant_type === s.tenant_type) === i
    ) as SubscriptionRow[]
  }, [subscriptionsData?.subscriptions])

  const statusOptions = useMemo(() => {
    const statuses = new Set<string>()
    subscriptions.forEach((sub) => {
      if (sub.status) statuses.add(sub.status)
    })
    return Array.from(statuses).sort()
  }, [subscriptions])

  const stats = useMemo(() => {
    const activeCount = subscriptions.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TRIALING'
    ).length
    const attentionCount = subscriptions.filter(needsAttention).length
    const suspendedCount = subscriptions.filter(
      (s) => s.status === 'SUSPENDED' || s.status === 'CANCELLED' || s.status === 'PAST_DUE'
    ).length
    return { total: subscriptions.length, activeCount, attentionCount, suspendedCount }
  }, [subscriptions])

  const filteredSubscriptions = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return subscriptions.filter((sub) => {
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false
      if (tenantTypeFilter !== 'all' && sub.tenant_type !== tenantTypeFilter) return false
      if (attentionOnly && !needsAttention(sub)) return false
      if (!q) return true
      const haystack = [sub.tenant_name, sub.tenant_email, sub.plan_name, sub.tenant_type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [subscriptions, debouncedSearch, statusFilter, tenantTypeFilter, attentionOnly])

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    statusFilter !== 'all' ||
    tenantTypeFilter !== 'all' ||
    attentionOnly

  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setStatusFilter('all')
    setTenantTypeFilter('all')
    setAttentionOnly(false)
  }

  return (
    <>
      <AdminSectionHeader
        title="Subscriptions"
        description="Review tenant plans, activation state, and billing status across the platform."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchSubscriptions()}
            disabled={subscriptionsFetching}
          >
            {subscriptionsFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      {!subscriptionsLoading && subscriptions.length > 0 && (
        <div className="mb-4">
          <SummaryStrip
            testId="admin-subscriptions-stats"
            metrics={[
              {
                label: 'Total',
                value: stats.total,
                hint: 'Unique tenant subscriptions',
                active: !attentionOnly && statusFilter === 'all' && tenantTypeFilter === 'all',
                onClick: () => {
                  setAttentionOnly(false)
                  setStatusFilter('all')
                  setTenantTypeFilter('all')
                },
              },
              {
                label: 'Active / trial',
                value: stats.activeCount,
                tone: 'mint',
                hint: 'ACTIVE or TRIALING',
              },
              {
                label: 'Needs attention',
                value: stats.attentionCount,
                tone: stats.attentionCount > 0 ? 'amber' : 'default',
                hint: 'Locked or pending activation',
                active: attentionOnly,
                onClick: () => setAttentionOnly((v) => !v),
              },
              {
                label: 'At risk',
                value: stats.suspendedCount,
                tone: stats.suspendedCount > 0 ? 'danger' : 'default',
                hint: 'Suspended, cancelled, or past due',
              },
            ]}
          />
        </div>
      )}

      <div className="mb-4 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          Filters
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto]">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder="Search tenant, email, or plan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search subscriptions"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filter by status">
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </option>
              ))}
            </SelectTrigger>
          </Select>

          <Select value={tenantTypeFilter} onValueChange={setTenantTypeFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filter by tenant type">
              <option value="all">All tenant types</option>
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </SelectTrigger>
          </Select>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <AppPanel
        title="Tenant subscriptions"
        description={
          subscriptionsLoading
            ? 'Loading subscriptions…'
            : `${filteredSubscriptions.length} subscription${filteredSubscriptions.length === 1 ? '' : 's'} shown${filteredSubscriptions.length !== subscriptions.length ? ` of ${subscriptions.length}` : ''}`
        }
        testId="admin-subscriptions-panel"
        footer={
          subscriptionsFetching && !subscriptionsLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating results…
            </p>
          ) : undefined
        }
      >
        {subscriptionsLoading ? (
          <AdminLoadingSkeleton rows={6} />
        ) : filteredSubscriptions.length === 0 ? (
          <AdminEmptyState
            icon={<CreditCard className="h-8 w-8 text-[var(--text-muted)]" />}
            title={
              hasActiveFilters ? 'No subscriptions match your filters' : 'No subscriptions yet'
            }
            description={
              hasActiveFilters
                ? 'Adjust search, status, or tenant type filters and try again.'
                : 'Subscriptions appear here when tenants register and select a plan.'
            }
            action={
              hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableScroll aria-label="Tenant subscriptions">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="hidden px-4 py-3 md:table-cell">Type</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)]">
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.id} className="transition-colors hover:bg-[var(--brand-ultra)]/35">
                    <td className="px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--text)]">
                          {sub.tenant_name || 'Unknown tenant'}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {sub.tenant_email || '—'}
                        </p>
                        {needsAttention(sub) && (
                          <Badge
                            variant="outline"
                            className="mt-1.5 border-amber-200 bg-amber-50 text-[10px] font-medium text-amber-800"
                          >
                            Needs attention
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="outline" className="font-normal">
                        {formatPlanDisplayName(sub.plan_code, sub.plan_name)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={sub.status} />
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <Badge
                        variant="outline"
                        className={cn('text-xs capitalize', tenantTypeTone(sub.tenant_type))}
                      >
                        {sub.tenant_type.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3.5 text-xs text-[var(--text-muted)] lg:table-cell">
                      {formatAdminDate(sub.created_at)}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap justify-end gap-2">
                        {sub.lock_reason === 'free_sandbox_expired' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={isExtendingTrial}
                            onClick={async () => {
                              try {
                                await extendFreeTrial({ id: sub.id }).unwrap()
                                toast.success('Free Trial extended')
                              } catch {
                                toast.error('Failed to extend Free Trial')
                              }
                            }}
                          >
                            Extend trial
                          </Button>
                        )}
                        {(sub.account_locked_at || sub.lock_reason === 'pending_activation') && (
                          <Button
                            size="sm"
                            disabled={isUnlocking}
                            onClick={async () => {
                              try {
                                await unlockSubscription({
                                  id: sub.id,
                                  reason: 'admin_activation',
                                }).unwrap()
                                toast.success('Account activated')
                              } catch {
                                toast.error('Failed to activate account')
                              }
                            }}
                          >
                            Activate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onOpenChangePlan({
                              id: sub.id,
                              tenant_type: sub.tenant_type,
                              tenant_name: sub.tenant_name,
                            })
                          }
                        >
                          Change plan
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </AppPanel>
    </>
  )
}
