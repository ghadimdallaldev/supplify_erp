import React, { Fragment, useEffect, useMemo, useState } from 'react'
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
  useGetAdminPromotionPricingQuery,
  useUpdateAdminPromotionPricingMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import {
  Loader2,
  Check,
  X,
  DollarSign,
  Pause,
  Search,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FilterX,
  ChevronRight,
} from 'lucide-react'
import { AdminEmptyState, AdminLoadingState, AdminStatusBadge, formatAdminDate } from './adminUi'
import { cn } from '../../lib/utils'

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'pending_admin_approval', label: 'Pending admin approval' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved_pending_payment', label: 'Pending payment' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'percentage_off', label: 'Percentage off' },
  { value: 'fixed_off', label: 'Fixed discount' },
  { value: 'bogo', label: 'Buy one get one' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'free_shipping', label: 'Free shipping' },
]

const QUICK_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'expired', label: 'Expired' },
]

const PAGE_SIZES = [10, 25, 50] as const

type SortKey = 'name' | 'supplier' | 'type' | 'status' | 'starts_at' | 'ends_at' | 'created_at'

type DealRow = Record<string, unknown>

function formatDealType(type: unknown): string {
  const key = String(type || '')
  return TYPE_OPTIONS.find((t) => t.value === key)?.label || key.replace(/_/g, ' ') || '—'
}

function formatDealValue(deal: DealRow): string | null {
  const type = String(deal.type || '')
  const raw = deal.discount_value ?? deal.discount_amount ?? deal.value
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return String(raw)
  if (type === 'percentage_off') return `${n}% off`
  if (type === 'free_shipping') return 'Free shipping'
  if (type === 'fixed_off') return `$${n.toFixed(2)} off`
  return String(raw)
}

function compareDeals(a: DealRow, b: DealRow, key: SortKey, dir: 'asc' | 'desc'): number {
  const mul = dir === 'asc' ? 1 : -1
  const str = (v: unknown) => String(v ?? '').toLowerCase()
  const date = (v: unknown) => {
    const t = new Date(String(v || '')).getTime()
    return Number.isNaN(t) ? 0 : t
  }
  switch (key) {
    case 'name':
      return mul * str(a.name).localeCompare(str(b.name))
    case 'supplier':
      return mul * str(a.supplier_name).localeCompare(str(b.supplier_name))
    case 'type':
      return mul * str(a.type).localeCompare(str(b.type))
    case 'status':
      return mul * str(a.status).localeCompare(str(b.status))
    case 'starts_at':
      return mul * (date(a.starts_at) - date(b.starts_at))
    case 'ends_at':
      return mul * (date(a.ends_at) - date(b.ends_at))
    case 'created_at':
      return mul * (date(a.created_at) - date(b.created_at))
    default:
      return 0
  }
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = activeKey === sortKey
  const Icon = active ? (direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown
  return (
    <th className={cn('px-3 py-2.5 font-medium', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:text-[var(--text)] hover:bg-[var(--app-bg-subtle)] transition-colors',
          active ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
        )}
      >
        {label}
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </button>
    </th>
  )
}

export function AdminDealsPanel() {
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10)
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
  const { data: pricingData, refetch: refetchPricing } = useGetAdminPromotionPricingQuery()
  const [approveDeal] = useApproveAdminDealMutation()
  const [rejectDeal] = useRejectAdminDealMutation()
  const [pauseDeal] = usePauseAdminDealMutation()
  const [updatePricing, { isLoading: savingPricing }] = useUpdateAdminPromotionPricingMutation()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    amount: '',
    durationDays: '',
    displayName: '',
    description: '',
    estimatedReachLabel: '',
    badgeLabel: '',
    isRecommended: false,
    isActive: true,
  })

  const deals = data?.deals || []
  const insights = insightsData?.insights
  const pricing = pricingData?.pricing || []
  const boostPackages = pricing.filter(
    (t) =>
      String(t.package_type || '') === 'boost' || String(t.pricing_key || '').startsWith('boost_')
  )
  const activationPricing = pricing.find((t) => String(t.pricing_key) === 'deal_activation')

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

  const handleSort = (key: SortKey) => {
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
      toast.success('Deal approved')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to approve deal')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await rejectDeal({ id, rejectionReason: rejectReason || undefined }).unwrap()
      toast.success('Deal rejected')
      setRejectingId(null)
      setRejectReason('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to reject deal')
    }
  }

  const handlePause = async (id: string) => {
    try {
      await pauseDeal(id).unwrap()
      toast.success('Deal paused')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to pause deal')
    }
  }

  const startEditPricing = (tier: Record<string, unknown>) => {
    const key = String(tier.pricing_key)
    setEditingKey(key)
    setEditForm({
      amount: String(tier.amount ?? ''),
      durationDays: tier.duration_days != null ? String(tier.duration_days) : '',
      displayName: String(tier.display_name || ''),
      description: String(tier.description || ''),
      estimatedReachLabel: String(tier.estimated_reach_label || ''),
      badgeLabel: String(tier.badge_label || ''),
      isRecommended: Boolean(tier.is_recommended),
      isActive: tier.is_active !== false,
    })
  }

  const savePricing = async (key: string) => {
    try {
      await updatePricing({
        key,
        amount: Number(editForm.amount),
        durationDays: editForm.durationDays ? Number(editForm.durationDays) : null,
        displayName: editForm.displayName || undefined,
        description: editForm.description || null,
        estimatedReachLabel: editForm.estimatedReachLabel || null,
        badgeLabel: editForm.badgeLabel || null,
        isRecommended: editForm.isRecommended,
        isActive: editForm.isActive,
      }).unwrap()
      toast.success('Boost package updated')
      setEditingKey(null)
      refetchPricing()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to update pricing')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Deals & promotions</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Review supplier deals, activation payment status, and platform-wide deal insights.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {insights && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total deals', value: insights.total_deals },
            { label: 'Active', value: insights.active_deals },
            { label: 'Pending approval', value: insights.pending_approval },
            { label: 'Pending payment', value: insights.pending_payment },
            { label: 'Total views', value: insights.total_views },
            { label: 'Orders from deals', value: insights.orders_from_deals },
            {
              label: 'Revenue (orders w/ deals)',
              value: `$${Number(insights.total_revenue || 0).toFixed(0)}`,
            },
            {
              label: 'Discount given',
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
            <CardTitle className="text-base">All supplier deals</CardTitle>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={clearFilters}
              >
                <FilterX className="h-3.5 w-3.5 mr-1" />
                Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_STATUS_FILTERS.map(({ value, label }) => (
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
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9" placeholder="All statuses">
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value || 'all'} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectTrigger>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Deal type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9" placeholder="All types">
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value || 'all'} value={t.value}>
                        {t.label}
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
                  placeholder="Title or supplier…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <AdminLoadingState label="Loading deals…" />
          ) : sortedDeals.length === 0 ? (
            <AdminEmptyState
              title="No deals found"
              description={
                hasActiveFilters
                  ? 'No deals match your filters. Try clearing filters or choosing “All statuses”.'
                  : 'No supplier deals yet. Deals appear here when suppliers create and submit promotions.'
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--app-bg-subtle)]/80 text-left text-xs">
                      <th className="w-8 px-2 py-2.5" aria-label="Expand row" />
                      <SortableHeader
                        label="Deal"
                        sortKey="name"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Supplier"
                        sortKey="supplier"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Type"
                        sortKey="type"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Status"
                        sortKey="status"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <th className="px-3 py-2.5 font-medium text-[var(--text-muted)]">Payment</th>
                      <SortableHeader
                        label="Start"
                        sortKey="starts_at"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="End"
                        sortKey="ends_at"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Created"
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
                                      <Check className="h-3 w-3 mr-1" /> Approve
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
                                      placeholder="Optional reason shown to supplier"
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
              </div>
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
                    <select
                      className="h-8 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-2 text-xs"
                      value={pageSize}
                      onChange={(e) =>
                        setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                      }
                    >
                      {PAGE_SIZES.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
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

      <div>
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Boost packages & activation
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Configure Facebook-style boost packages suppliers see when promoting deals. Price changes
          apply to new purchases only — existing boosts keep the amount paid at checkout.
        </p>
      </div>

      {activationPricing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal activation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{String(activationPricing.display_name)}</p>
            <p className="text-[var(--text-muted)] mt-1">
              {String(activationPricing.description || '')}
            </p>
            <p className="mt-2 tabular-nums font-semibold">
              ${Number(activationPricing.amount).toFixed(2)}
              {Number(activationPricing.amount) === 0 ? (
                <span className="ml-2 text-xs font-normal text-emerald-700">
                  · {String(activationPricing.badge_label || 'Free after admin approval')}
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boost packages</CardTitle>
        </CardHeader>
        <CardContent>
          {boostPackages.length === 0 ? (
            <AdminEmptyState
              title="No boost packages configured"
              description="Run migration 0123 or seed boost_flat / boost_7_day / boost_30_day rows."
            />
          ) : (
            <div className="space-y-3">
              {boostPackages.map((tier) => {
                const key = String(tier.pricing_key)
                const isEditing = editingKey === key
                return (
                  <div key={key} className="rounded-lg border p-4 space-y-3">
                    {isEditing ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm space-y-1">
                          <span className="text-[var(--text-muted)]">Display name</span>
                          <Input
                            value={editForm.displayName}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, displayName: e.target.value }))
                            }
                          />
                        </label>
                        <label className="text-sm space-y-1">
                          <span className="text-[var(--text-muted)]">Price ($)</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                          />
                        </label>
                        <label className="text-sm space-y-1">
                          <span className="text-[var(--text-muted)]">Duration (days)</span>
                          <Input
                            type="number"
                            min={1}
                            value={editForm.durationDays}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, durationDays: e.target.value }))
                            }
                          />
                        </label>
                        <label className="text-sm space-y-1">
                          <span className="text-[var(--text-muted)]">Badge label</span>
                          <Input
                            value={editForm.badgeLabel}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, badgeLabel: e.target.value }))
                            }
                            placeholder="Most popular"
                          />
                        </label>
                        <label className="text-sm space-y-1 sm:col-span-2">
                          <span className="text-[var(--text-muted)]">Description</span>
                          <Input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                          />
                        </label>
                        <label className="text-sm space-y-1 sm:col-span-2">
                          <span className="text-[var(--text-muted)]">Estimated reach label</span>
                          <Input
                            value={editForm.estimatedReachLabel}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, estimatedReachLabel: e.target.value }))
                            }
                            placeholder="Higher placement for 7 days"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.isRecommended}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, isRecommended: e.target.checked }))
                            }
                          />
                          Recommended package
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.isActive}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, isActive: e.target.checked }))
                            }
                          />
                          Active (available for purchase)
                        </label>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button
                            size="sm"
                            onClick={() => savePricing(key)}
                            disabled={savingPricing}
                          >
                            Save package
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{String(tier.display_name)}</p>
                            {tier.badge_label ? (
                              <span className="text-xs rounded-full bg-[var(--surface-muted)] px-2 py-0.5">
                                {String(tier.badge_label)}
                              </span>
                            ) : null}
                            {tier.is_recommended ? (
                              <span className="text-xs text-[var(--brand)]">Recommended</span>
                            ) : null}
                            {tier.is_active === false ? (
                              <span className="text-xs text-[var(--red)]">Inactive</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {tier.duration_days
                              ? `${tier.duration_days} day(s)`
                              : 'No fixed duration'}
                            {tier.estimated_reach_label
                              ? ` · ${String(tier.estimated_reach_label)}`
                              : ''}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xl">
                            {String(tier.description || '')}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] mt-2 font-mono">
                            {key}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            ${Number(tier.amount).toFixed(2)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditPricing(tier)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
