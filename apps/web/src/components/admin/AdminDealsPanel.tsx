import React, { Fragment, Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select'
import {
  useGetAdminDealsQuery,
  useGetAdminDealInsightsQuery,
  useApproveAdminDealMutation,
  useRejectAdminDealMutation,
  usePauseAdminDealMutation,
} from '../../services/api'
import { toast } from 'sonner'
import { Loader2, Check, X, Pause, Search, RefreshCw, FilterX, ChevronRight } from 'lucide-react'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminSectionHeader,
  AdminStatusBadge,
  formatAdminDate,
} from './adminUi'
import { cn } from '../../lib/utils'
import { TableScroll } from '../ui/table-scroll'
import { responsiveDataListClasses } from '../ui/responsive-data-list'
import { ADMIN_EMPTY_STATE } from '../../lib/dealDisplayLabels'
import {
  DEAL_PAGE_SIZES,
  DEAL_QUICK_STATUS_FILTERS,
  DEAL_STATUS_OPTIONS,
  DEAL_TYPE_OPTIONS,
} from './deals/adminDealsConstants'
import {
  compareDeals,
  DealSortableHeader,
  formatDealType,
  formatDealValue,
  type DealSortKey,
} from './deals/adminDealsTableUtils'
import { AdminTabLoading } from './dashboard/adminDashboardShared'

const LazyAdminDealsBoostSection = lazy(() =>
  import('./deals/AdminDealsBoostSection').then((m) => ({ default: m.AdminDealsBoostSection }))
)

export function AdminDealsPanel() {
  const { t } = useTranslation('admin')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [sortKey, setSortKey] = useState<DealSortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof DEAL_PAGE_SIZES)[number]>(10)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [statusFilter, typeFilter, debouncedSearch, fromDate, toDate, pageSize])

  const apiStatus =
    statusFilter === 'pending_review' ? 'pending_approval' : statusFilter || undefined

  const { data, isLoading, refetch, isFetching } = useGetAdminDealsQuery({
    status: apiStatus,
    type: typeFilter || undefined,
    search: debouncedSearch || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  })
  const { data: insightsData } = useGetAdminDealInsightsQuery()
  const [approveDeal] = useApproveAdminDealMutation()
  const [rejectDeal] = useRejectAdminDealMutation()
  const [pauseDeal] = usePauseAdminDealMutation()

  const deals = useMemo(() => data?.deals || [], [data?.deals])
  const insights = insightsData?.insights

  const hasActiveFilters = Boolean(
    statusFilter || typeFilter || debouncedSearch || fromDate || toDate
  )

  const sortedDeals = useMemo(
    () => [...deals].sort((a, b) => compareDeals(a, b, sortKey, sortDir)),
    [deals, sortKey, sortDir]
  )

  const totalPages = Math.max(1, Math.ceil(sortedDeals.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageDeals = sortedDeals.slice((safePage - 1) * pageSize, safePage * pageSize)

  const pendingOnPage = pageDeals.filter((d) => {
    const s = String(d.status || '')
    return s === 'pending_approval' || s === 'pending_admin_approval'
  }).length

  const handleSort = (key: DealSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'supplier' ? 'asc' : 'desc')
    }
  }

  const clearFilters = () => {
    setStatusFilter('')
    setTypeFilter('')
    setSearchInput('')
    setDebouncedSearch('')
    setFromDate('')
    setToDate('')
  }

  const handleApprove = async (id: string) => {
    try {
      await approveDeal(id).unwrap()
      toast.success(t('deals.toasts.approved'))
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('deals.toasts.approveFailed'))
    }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectDeal({ id, rejectionReason: rejectReason || undefined }).unwrap()
      toast.success(t('deals.toasts.rejected'))
      setRejectingId(null)
      setRejectReason('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('deals.toasts.rejectFailed'))
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pauseDeal(id).unwrap()
      toast.success(t('deals.toasts.paused'))
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('deals.toasts.pauseFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <AdminSectionHeader
        title={t('deals.title')}
        description={t('deals.description')}
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">{t('common.refresh')}</span>
          </Button>
        }
      />

      {insights && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: t('deals.insights.totalDeals'), value: insights.total_deals },
            { label: t('deals.insights.activeDeals'), value: insights.active_deals },
            { label: t('deals.insights.pendingApproval'), value: insights.pending_approval },
            { label: t('deals.insights.pendingPayment'), value: insights.pending_payment },
            { label: t('deals.insights.totalViews'), value: insights.total_views },
            { label: t('deals.insights.dealRedemptions'), value: insights.orders_from_deals },
            {
              label: t('deals.insights.boostRevenue'),
              value: `$${Number(insights.total_revenue || 0).toFixed(0)}`,
            },
            {
              label: t('deals.insights.discountAmount'),
              value: `$${Number(insights.total_discount_given || 0).toFixed(0)}`,
            },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-[var(--text-muted)]">{label}</p>
                <p className="text-xl font-bold">{value ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{t('deals.allDeals')}</CardTitle>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={clearFilters}
              >
                <FilterX className="h-3.5 w-3.5 mr-1" />
                {t('common.clearFilters')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {DEAL_QUICK_STATUS_FILTERS.map(({ value, labelKey }) => (
              <button
                key={value || 'all'}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  statusFilter === value
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--app-border)] hover:border-[var(--brand-mid)] hover:text-[var(--text)]'
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.table.status')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9" placeholder={t('common.allStatuses')}>
                  <SelectContent>
                    {DEAL_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || 'all'} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('common.table.type')}</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9" placeholder={t('common.allTypes')}>
                  <SelectContent>
                    {DEAL_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value || 'all'} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From date</Label>
              <Input
                type="date"
                className="h-9"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To date</Label>
              <Input
                type="date"
                className="h-9"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  className="pl-8 h-9"
                  placeholder={t('deals.searchPlaceholder')}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <AdminLoadingState label={t('deals.loading')} />
          ) : sortedDeals.length === 0 ? (
            <AdminEmptyState
              title={ADMIN_EMPTY_STATE.title}
              description={
                hasActiveFilters
                  ? 'No deals match your filters. Try clearing filters or choosing “All statuses”.'
                  : ADMIN_EMPTY_STATE.description
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
            <div className="overflow-hidden rounded-lg border border-[var(--app-border)]">
              <div className="space-y-3 p-4 lg:hidden">
                {pageDeals.map((deal) => (
                  <article
                    key={deal.id}
                    className="rounded-lg border border-[var(--app-border)] p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{String(deal.name || deal.title || 'Deal')}</p>
                      <AdminStatusBadge status={String(deal.status || '')} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {String(deal.supplier_name || '—')}
                    </p>
                    <p className="text-sm">{formatDealValue(deal)}</p>
                  </article>
                ))}
              </div>
              <TableScroll
                aria-label={t('deals.title')}
                className="hidden lg:block border-0 rounded-none"
              >
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--app-bg-subtle)]/80 text-left text-xs">
                      <th className="w-8 px-2 py-2.5" aria-label={t('common.expandRowAriaLabel')} />
                      <DealSortableHeader
                        label={t('common.table.deal')}
                        sortKey="name"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <DealSortableHeader
                        label={t('common.table.supplier')}
                        sortKey="supplier"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <DealSortableHeader
                        label={t('common.table.type')}
                        sortKey="type"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <DealSortableHeader
                        label={t('common.table.status')}
                        sortKey="status"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <th className="px-3 py-2.5 font-medium text-[var(--text-muted)]">Payment</th>
                      <DealSortableHeader
                        label={t('common.table.start')}
                        sortKey="starts_at"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <DealSortableHeader
                        label={t('common.table.end')}
                        sortKey="ends_at"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <DealSortableHeader
                        label={t('common.table.created')}
                        sortKey="created_at"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <th className="px-3 py-2.5 font-medium text-[var(--text-muted)] text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {pageDeals.map((deal) => {
                      const id = String(deal.id)
                      const status = String(deal.status || '')
                      const isPending =
                        status === 'pending_approval' || status === 'pending_admin_approval'
                      const isExpanded = expandedId === id
                      const valueLabel = formatDealValue(deal)

                      return (
                        <Fragment key={id}>
                          <tr
                            className={cn(
                              'transition-colors',
                              isExpanded
                                ? 'bg-[var(--brand-ultra)]/50'
                                : 'hover:bg-[var(--brand-ultra)]/30'
                            )}
                          >
                            <td className="px-2 py-2.5">
                              <button
                                type="button"
                                className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--app-bg-subtle)] hover:text-[var(--text)]"
                                onClick={() => setExpandedId(isExpanded ? null : id)}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                              >
                                <ChevronRight
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    isExpanded && 'rotate-90'
                                  )}
                                />
                              </button>
                            </td>
                            <td className="px-3 py-2.5 max-w-[14rem]">
                              <p className="font-medium text-[var(--text)] truncate">
                                {String(deal.name)}
                              </p>
                              {valueLabel && (
                                <p className="text-xs text-[var(--brand-mid)] mt-0.5">
                                  {valueLabel}
                                </p>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[var(--text-muted)] max-w-[10rem] truncate">
                              {String(deal.supplier_name || '—')}
                            </td>
                            <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap">
                              {formatDealType(deal.type)}
                            </td>
                            <td className="px-3 py-2.5">
                              <AdminStatusBadge status={status} />
                            </td>
                            <td className="px-3 py-2.5">
                              <AdminStatusBadge
                                status={String(deal.payment_status || 'not_required')}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap tabular-nums">
                              {formatAdminDate(deal.starts_at)}
                            </td>
                            <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap tabular-nums">
                              {formatAdminDate(deal.ends_at)}
                            </td>
                            <td className="px-3 py-2.5 text-[var(--text-muted)] whitespace-nowrap tabular-nums">
                              {formatAdminDate(deal.created_at)}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap justify-end gap-1">
                                {isPending && (
                                  <>
                                    <Button size="sm" onClick={() => handleApprove(id)}>
                                      <Check className="h-3 w-3 mr-1" /> Approve & publish
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setRejectingId(rejectingId === id ? null : id)}
                                    >
                                      <X className="h-3 w-3 mr-1" /> Reject
                                    </Button>
                                  </>
                                )}
                                {(status === 'active' || status === 'scheduled') && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handlePause(id)}
                                  >
                                    <Pause className="h-3 w-3 mr-1" /> Pause
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-[var(--app-bg-subtle)]/40">
                              <td
                                colSpan={10}
                                className="px-4 py-3 text-xs text-[var(--text-muted)]"
                              >
                                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  <div>
                                    <dt className="font-medium text-[var(--text)]">Deal ID</dt>
                                    <dd className="font-mono mt-0.5 break-all">{id}</dd>
                                  </div>
                                  {deal.description ? (
                                    <div className="sm:col-span-2">
                                      <dt className="font-medium text-[var(--text)]">
                                        Description
                                      </dt>
                                      <dd className="mt-0.5">{String(deal.description)}</dd>
                                    </div>
                                  ) : null}
                                  {deal.min_order_amount != null ? (
                                    <div>
                                      <dt className="font-medium text-[var(--text)]">Min order</dt>
                                      <dd className="mt-0.5">
                                        ${Number(deal.min_order_amount).toFixed(2)}
                                      </dd>
                                    </div>
                                  ) : null}
                                  {deal.rejection_reason ? (
                                    <div className="sm:col-span-2">
                                      <dt className="font-medium text-[var(--text)]">
                                        Rejection reason
                                      </dt>
                                      <dd className="mt-0.5">{String(deal.rejection_reason)}</dd>
                                    </div>
                                  ) : null}
                                  {deal.boost_pricing_key ? (
                                    <>
                                      <div>
                                        <dt className="font-medium text-[var(--text)]">
                                          Boost package
                                        </dt>
                                        <dd className="mt-0.5 font-mono text-[11px]">
                                          {String(deal.boost_pricing_key)}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="font-medium text-[var(--text)]">
                                          Boost price (snapshot)
                                        </dt>
                                        <dd className="mt-0.5 tabular-nums">
                                          ${Number(deal.boost_price_snapshot || 0).toFixed(2)}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="font-medium text-[var(--text)]">
                                          Boost duration
                                        </dt>
                                        <dd className="mt-0.5">
                                          {String(deal.boost_duration_days || '—')} day(s)
                                        </dd>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <dt className="font-medium text-[var(--text)]">
                                          Boost window (on approval)
                                        </dt>
                                        <dd className="mt-0.5">
                                          Starts immediately for {String(deal.boost_duration_days)}{' '}
                                          day(s) after publish
                                        </dd>
                                      </div>
                                    </>
                                  ) : isPending ? (
                                    <div className="sm:col-span-2 text-amber-800">
                                      No boost package selected — cannot approve for publishing.
                                    </div>
                                  ) : null}
                                </dl>
                              </td>
                            </tr>
                          )}
                          {rejectingId === id && (
                            <tr>
                              <td
                                colSpan={10}
                                className="px-3 py-3 bg-amber-50/80 dark:bg-amber-950/20 border-t border-amber-200/50"
                              >
                                <div className="flex flex-wrap gap-2 items-end">
                                  <div className="flex-1 min-w-[12rem]">
                                    <Label>Rejection reason</Label>
                                    <Input
                                      className="mt-1 h-9 bg-[var(--surface)]"
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                      placeholder={t('deals.rejectionReasonPlaceholder')}
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleReject(id)}
                                  >
                                    Confirm reject
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setRejectingId(null)
                                      setRejectReason('')
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-t bg-[var(--app-bg-subtle)]/30 text-xs text-[var(--text-muted)]">
                <p>
                  Showing {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, sortedDeals.length)} of {sortedDeals.length} deal
                  {sortedDeals.length !== 1 ? 's' : ''}
                  {deals.length >= 200 ? ' (max 200 loaded)' : ''}
                  {pendingOnPage > 0 ? ` · ${pendingOnPage} pending on this page` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5">
                    <span>Per page</span>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(value) =>
                        setPageSize(Number(value) as (typeof DEAL_PAGE_SIZES)[number])
                      }
                    >
                      <SelectTrigger className="w-auto text-xs">
                        {DEAL_PAGE_SIZES.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </SelectTrigger>
                    </Select>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="px-2 tabular-nums">
                      {safePage} / {totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Suspense fallback={<AdminTabLoading className="py-8" />}>
        <LazyAdminDealsBoostSection />
      </Suspense>
    </div>
  )
}
