import React, { Fragment, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CreditCard,
  Loader2,
  Package,
  RefreshCw,
  Shield,
  Users,
} from 'lucide-react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { useGetAdminActivityQuery } from '../../../services/api'
import { formatCurrency } from '../../../utils/format'

const ACTIVITY_PAGE_SIZE = 30

export type AdminActivityTabProps = {
  active: boolean
}

export function AdminActivityTab({ active }: AdminActivityTabProps) {
  const [activityType, setActivityType] = useState('all')
  const [activityOffset, setActivityOffset] = useState(0)

  const {
    data: activityData,
    isLoading: activityLoading,
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

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Platform Activity</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Real-time stream of orders, registrations, plan changes and more
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-[var(--app-border-mid)] px-3 py-2 text-sm"
            value={activityType}
            onChange={(e) => {
              setActivityType(e.target.value)
              setActivityOffset(0)
            }}
          >
            <option value="all">All events</option>
            <option value="order_placed">Order placed</option>
            <option value="order_confirmed">Order acknowledged</option>
            <option value="order_completed">Order completed</option>
            <option value="deal_activity">Deal activity</option>
            <option value="cart_updated">Cart updated</option>
            <option value="new_tenant">New registration</option>
            <option value="plan_changed">Plan changed</option>
            <option value="subscription_status">Subscription status</option>
            <option value="staff_added">Staff added</option>
            <option value="reservation">Reservation</option>
            <option value="invoice_issued">Invoice issued</option>
            <option value="payment_received">Payment received</option>
            <option value="quick_list">Quick list</option>
            <option value="receiving">Receiving</option>
            <option value="chat_started">Chat started</option>
          </select>
          <Button variant="outline" size="sm" onClick={() => refetchActivity()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {activityLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--text-muted)]" />
        </div>
      ) : activityError ? (
        <Card className="p-6 border-red-200 bg-red-50/50">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[var(--text)]">Activity feed unavailable</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {(activityQueryError as { data?: { message?: string } })?.data?.message ||
                  'The activity API request failed. This is not shown as an empty feed.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetchActivity()}
              >
                Retry
              </Button>
            </div>
          </div>
        </Card>
      ) : !activityData?.events?.length ? (
        <div className="text-center py-16 text-[var(--text-muted)]">
          <Activity className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No matching activity</p>
          <p className="text-xs mt-1 max-w-md mx-auto">
            {activityType !== 'all'
              ? 'Try “All events” or another filter. The feed includes orders, registrations, plan changes, deals, boosts, reservations, and admin subscription actions when present in the database.'
              : 'No platform events found yet. Create tenants, place orders, or change subscriptions to populate this feed.'}
          </p>
        </div>
      ) : (
        <>
          {(activityData as { partial?: boolean; failedSources?: string[] }).partial && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
              Some activity sources could not be loaded (
              {(activityData as { failedSources?: string[] }).failedSources?.join(', ')}). Showing
              partial results.
            </p>
          )}
          <p className="text-xs text-[var(--text-muted)] mb-4">
            {activityData.total ?? activityData.events.length} events in current window
          </p>

          <div className="relative">
            <div
              className="absolute left-5 top-0 bottom-0 w-px"
              style={{ background: 'var(--app-border)' }}
            />

            <div className="space-y-0">
              {activityData.events.map((event: any, idx: number) => {
                const eventConfig: Record<
                  string,
                  {
                    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
                    color: string
                    bg: string
                    label: string
                  }
                > = {
                  order_placed: {
                    icon: Package,
                    color: 'var(--brand)',
                    bg: 'var(--brand-ultra)',
                    label: 'Order',
                  },
                  new_tenant: {
                    icon: Users,
                    color: 'var(--mint)',
                    bg: 'var(--mint-pale)',
                    label: 'New Tenant',
                  },
                  plan_changed: {
                    icon: CreditCard,
                    color: '#8b5cf6',
                    bg: '#ede9fe',
                    label: 'Plan Change',
                  },
                  subscription_status: {
                    icon: Shield,
                    color: '#f59e0b',
                    bg: '#fffbeb',
                    label: 'Subscription',
                  },
                }
                const cfg = eventConfig[event.event_type] ?? {
                  icon: Activity,
                  color: 'var(--text-muted)',
                  bg: 'var(--surface-mid)',
                  label: event.event_type,
                }
                const Icon = cfg.icon
                const timeStr = new Date(event.occurred_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                const prevEvent = idx > 0 ? activityData.events[idx - 1] : null
                const showDateDivider =
                  !prevEvent ||
                  new Date(prevEvent.occurred_at).toDateString() !==
                    new Date(event.occurred_at).toDateString()

                return (
                  <Fragment key={`${event.event_type}-${event.id}-${idx}`}>
                    {showDateDivider && (
                      <div className="flex items-center gap-3 py-3 ml-10">
                        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                          {new Date(event.occurred_at).toLocaleDateString('en-GB', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'long',
                          })}
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'var(--app-border)' }} />
                      </div>
                    )}
                    <div className="flex items-start gap-4 py-2.5 group">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center z-10 border-2"
                        style={{ background: cfg.bg, borderColor: cfg.color + '40' }}
                      >
                        <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                      </div>

                      <div
                        className="flex-1 min-w-0 pb-2.5"
                        style={{ borderBottom: '1px solid var(--app-border)' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                                style={{ background: cfg.bg, color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                              <span className="text-sm font-semibold text-[var(--text)] truncate">
                                {event.title}
                              </span>
                            </div>
                            {event.subtitle && (
                              <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                {event.subtitle}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {event.amount != null && event.amount > 0 && (
                              <span
                                className="text-sm font-semibold"
                                style={{ color: 'var(--mint)' }}
                              >
                                {formatCurrency(event.amount)}
                              </span>
                            )}
                            <span className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                              {timeStr}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          </div>

          {(activityData.total ?? 0) > ACTIVITY_PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={activityOffset === 0}
                onClick={() => setActivityOffset(Math.max(0, activityOffset - ACTIVITY_PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-sm text-[var(--text-muted)]">
                Page {Math.floor(activityOffset / ACTIVITY_PAGE_SIZE) + 1} of{' '}
                {Math.ceil((activityData.total ?? 0) / ACTIVITY_PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={activityOffset + ACTIVITY_PAGE_SIZE >= (activityData.total ?? 0)}
                onClick={() => setActivityOffset(activityOffset + ACTIVITY_PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
