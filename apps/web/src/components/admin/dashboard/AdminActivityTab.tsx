import { useMemo, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  CreditCard,
  Filter,
  Loader2,
  MessageSquare,
  Package,
  Receipt,
  RefreshCw,
  ShoppingCart,
  Truck,
  Users,
  Shield,
} from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Select, SelectTrigger } from '../../ui/select'
import { AppPanel } from '../../ui/app-panel'
import { useGetAdminActivityQuery } from '../../../services/api'
import { formatCurrency } from '../../../utils/format'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminSectionHeader,
  formatAdminDateTime,
} from '../adminUi'
import { cn } from '../../../lib/utils'

const ACTIVITY_PAGE_SIZE = 30

const ACTIVITY_TYPE_OPTION_KEYS = [
  { value: 'all', labelKey: 'activity.types.all' },
  { value: 'order_placed', labelKey: 'activity.types.order_placed' },
  { value: 'order_confirmed', labelKey: 'activity.types.order_confirmed' },
  { value: 'order_completed', labelKey: 'activity.types.order_completed' },
  { value: 'deal_activity', labelKey: 'activity.types.deal_activity' },
  { value: 'cart_updated', labelKey: 'activity.types.cart_updated' },
  { value: 'new_tenant', labelKey: 'activity.types.new_tenant' },
  { value: 'plan_changed', labelKey: 'activity.types.plan_changed' },
  { value: 'subscription_status', labelKey: 'activity.types.subscription_status' },
  { value: 'staff_added', labelKey: 'activity.types.staff_added' },
  { value: 'reservation', labelKey: 'activity.types.reservation' },
  { value: 'invoice_issued', labelKey: 'activity.types.invoice_issued' },
  { value: 'payment_received', labelKey: 'activity.types.payment_received' },
  { value: 'quick_list', labelKey: 'activity.types.quick_list' },
  { value: 'receiving', labelKey: 'activity.types.receiving' },
  { value: 'chat_started', labelKey: 'activity.types.chat_started' },
] as const

type ActivityEvent = {
  id: string
  event_type: string
  title: string
  subtitle?: string
  occurred_at: string
  amount?: number
}

type EventVisual = {
  icon: ComponentType<{ className?: string }>
  badgeClass: string
  label: string
}

const EVENT_VISUAL_KEYS: Record<
  string,
  { icon: ComponentType<{ className?: string }>; badgeClass: string; labelKey: string }
> = {
  order_placed: {
    icon: Package,
    badgeClass: 'bg-[var(--brand-pale)] text-[var(--brand)] border-[var(--brand)]/20',
    labelKey: 'activity.badges.order',
  },
  order_confirmed: {
    icon: Package,
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    labelKey: 'activity.badges.acknowledged',
  },
  order_completed: {
    icon: Truck,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    labelKey: 'activity.badges.completed',
  },
  deal_activity: {
    icon: Activity,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    labelKey: 'activity.badges.deal',
  },
  cart_updated: {
    icon: ShoppingCart,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    labelKey: 'activity.badges.cart',
  },
  new_tenant: {
    icon: Users,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    labelKey: 'activity.badges.registration',
  },
  plan_changed: {
    icon: CreditCard,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
    labelKey: 'activity.badges.planChange',
  },
  subscription_status: {
    icon: Shield,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    labelKey: 'activity.badges.subscription',
  },
  staff_added: {
    icon: Users,
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    labelKey: 'activity.badges.staff',
  },
  reservation: {
    icon: Activity,
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200',
    labelKey: 'activity.badges.reservation',
  },
  invoice_issued: {
    icon: Receipt,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    labelKey: 'activity.badges.invoice',
  },
  payment_received: {
    icon: CreditCard,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    labelKey: 'activity.badges.payment',
  },
  quick_list: {
    icon: Package,
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    labelKey: 'activity.badges.quickList',
  },
  receiving: {
    icon: Truck,
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    labelKey: 'activity.badges.receiving',
  },
  chat_started: {
    icon: MessageSquare,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    labelKey: 'activity.badges.chat',
  },
}

function eventVisual(eventType: string, t: (key: string) => string): EventVisual {
  const cfg = EVENT_VISUAL_KEYS[eventType]
  if (cfg) {
    return { icon: cfg.icon, badgeClass: cfg.badgeClass, label: t(cfg.labelKey) }
  }
  return {
    icon: Activity,
    badgeClass: 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]',
    label: eventType.replace(/_/g, ' '),
  }
}

function ActivityEventBadge({ eventType, t }: { eventType: string; t: (key: string) => string }) {
  const cfg = eventVisual(eventType, t)
  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 text-xs font-medium capitalize', cfg.badgeClass)}
    >
      {cfg.label}
    </Badge>
  )
}

export type AdminActivityTabProps = {
  active: boolean
}

export function AdminActivityTab({ active }: AdminActivityTabProps) {
  const { t } = useTranslation('admin')
  const activityTypeOptions = useMemo(
    () => ACTIVITY_TYPE_OPTION_KEYS.map((opt) => ({ ...opt, label: t(opt.labelKey) })),
    [t]
  )
  const [activityType, setActivityType] = useState('all')
  const [activityOffset, setActivityOffset] = useState(0)

  const {
    data: activityData,
    isLoading: activityLoading,
    isFetching: activityFetching,
    isError: activityError,
    error: activityQueryError,
    refetch: refetchActivity,
  } = useGetAdminActivityQuery(
    {
      limit: ACTIVITY_PAGE_SIZE,
      offset: activityOffset,
      ...(activityType !== 'all' && { type: activityType }),
    },
    { skip: !active }
  )

  const events = useMemo(
    () => (activityData?.events ?? []) as ActivityEvent[],
    [activityData?.events]
  )
  const total = activityData?.total ?? events.length
  const page = Math.floor(activityOffset / ACTIVITY_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))
  const partial = Boolean((activityData as { partial?: boolean })?.partial)
  const failedSources = (activityData as { failedSources?: string[] })?.failedSources

  const hasActiveFilters = activityType !== 'all'

  const clearFilters = () => {
    setActivityType('all')
    setActivityOffset(0)
  }

  const groupedByDate = useMemo(() => {
    const groups: Array<{ dateLabel: string; events: ActivityEvent[] }> = []
    for (const event of events) {
      const dateLabel = new Date(event.occurred_at).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      const last = groups[groups.length - 1]
      if (last?.dateLabel === dateLabel) {
        last.events.push(event)
      } else {
        groups.push({ dateLabel, events: [event] })
      }
    }
    return groups
  }, [events])

  return (
    <>
      <AdminSectionHeader
        title={t('activity.title')}
        description={t('activity.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchActivity()}
            disabled={activityFetching}
          >
            {activityFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      <div className="mb-4 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {t('common.filters')}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={activityType}
            onValueChange={(value) => {
              setActivityType(value)
              setActivityOffset(0)
            }}
          >
            <SelectTrigger
              className="h-10 w-full min-w-[200px] sm:w-auto"
              aria-label={t('activity.filterEventTypeAriaLabel')}
            >
              {activityTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectTrigger>
          </Select>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <AppPanel
        title={t('activity.feedTitle')}
        description={
          activityLoading
            ? t('common.loadingActivity')
            : total > 0
              ? t('activity.eventsPage', { total, page, pageCount })
              : t('activity.eventsCount', { count: total })
        }
        testId="admin-activity-panel"
        footer={
          activityFetching && !activityLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.updatingFeed')}
            </p>
          ) : undefined
        }
      >
        {activityLoading ? (
          <AdminLoadingState label={t('activity.loadingFeed')} />
        ) : activityError ? (
          <AdminErrorState
            title={t('activity.unavailableTitle')}
            message={
              (activityQueryError as { data?: { message?: string } })?.data?.message ||
              t('activity.apiFailed')
            }
            onRetry={() => refetchActivity()}
          />
        ) : events.length === 0 ? (
          <AdminEmptyState
            icon={<Activity className="h-8 w-8 text-[var(--text-muted)]" />}
            title={
              hasActiveFilters ? t('activity.emptyFilteredTitle') : t('activity.emptyDefaultTitle')
            }
            description={
              hasActiveFilters
                ? t('activity.emptyFilteredDescription')
                : t('activity.emptyDefaultDescription')
            }
            action={
              hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  {t('common.clearFilter')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {partial && (
              <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {t('activity.partialSources')}
                {failedSources?.length ? ` (${failedSources.join(', ')})` : ''}.{' '}
                {t('activity.partialResults')}
              </p>
            )}

            <div className="space-y-6">
              {groupedByDate.map((group) => (
                <div key={group.dateLabel}>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {group.dateLabel}
                    </span>
                    <div className="h-px flex-1 bg-[var(--app-border)]" />
                  </div>

                  <ul className="divide-y divide-[var(--app-border)] rounded-lg border border-[var(--app-border)]">
                    {group.events.map((event, idx) => {
                      const cfg = eventVisual(event.event_type, t)
                      const Icon = cfg.icon
                      return (
                        <li
                          key={`${event.event_type}-${event.id}-${idx}`}
                          className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--brand-ultra)]/25 sm:gap-4"
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                              cfg.badgeClass
                            )}
                            aria-hidden
                          >
                            <Icon className="h-4 w-4" />
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <ActivityEventBadge eventType={event.event_type} t={t} />
                              <p className="truncate text-sm font-medium text-[var(--text)]">
                                {event.title}
                              </p>
                            </div>
                            {event.subtitle && (
                              <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                                {event.subtitle}
                              </p>
                            )}
                          </div>

                          <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                            {event.amount != null && event.amount > 0 && (
                              <span className="text-sm font-semibold tabular-nums text-[var(--mint)]">
                                {formatCurrency(event.amount)}
                              </span>
                            )}
                            <time
                              className="whitespace-nowrap text-xs text-[var(--text-muted)]"
                              dateTime={event.occurred_at}
                            >
                              {formatAdminDateTime(event.occurred_at)}
                            </time>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {total > ACTIVITY_PAGE_SIZE && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
                <p className="text-xs text-[var(--text-muted)]">
                  {t('activity.showingRange', {
                    from: activityOffset + 1,
                    to: Math.min(activityOffset + ACTIVITY_PAGE_SIZE, total),
                    total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activityOffset === 0}
                    onClick={() =>
                      setActivityOffset(Math.max(0, activityOffset - ACTIVITY_PAGE_SIZE))
                    }
                  >
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm text-[var(--text-muted)]">
                    {t('activity.pageOf', { page, pageCount })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activityOffset + ACTIVITY_PAGE_SIZE >= total}
                    onClick={() => setActivityOffset(activityOffset + ACTIVITY_PAGE_SIZE)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </AppPanel>
    </>
  )
}
