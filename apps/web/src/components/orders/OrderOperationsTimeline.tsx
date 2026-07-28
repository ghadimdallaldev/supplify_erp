import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Package,
  PackageCheck,
  Receipt,
  ShoppingCart,
  Truck,
} from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import type { TimelineEvent, TimelineEventState, TimelineViewerRole } from '../../lib/orderTimeline'

function eventIcon(title: string) {
  const key = title.toLowerCase()
  if (key.includes('cancelled')) return AlertTriangle
  if (key.includes('approval')) return Clock
  if (key.includes('placed') || (key.includes('order') && key.includes('received')))
    return ShoppingCart
  if (key.includes('acknowledged') || key.includes('confirmed')) return CheckCircle2
  if (key.includes('delivered') || key.includes('marked delivered')) return PackageCheck
  if (key.includes('substitut')) return ArrowLeftRight
  if (key.includes('processing')) return Package
  if (key.includes('shipped')) return Truck
  if (key.includes('received') || key.includes('completed')) return PackageCheck
  if (key.includes('dispute')) return AlertTriangle
  if (key.includes('credit')) return Receipt
  if (key.includes('invoice')) return FileText
  return Circle
}

function stateStyles(state: TimelineEventState) {
  switch (state) {
    case 'completed':
      return {
        dot: 'bg-[var(--mint)] border-[var(--mint)] text-white',
        line: 'bg-[var(--mint)]',
        title: 'text-[var(--text)]',
      }
    case 'current':
      return {
        dot: 'bg-[var(--brand)] border-[var(--brand)] text-white ring-4 ring-[var(--brand-ultra)]',
        line: 'bg-[var(--app-border)]',
        title: 'text-[var(--text)] font-semibold',
      }
    case 'skipped':
      return {
        dot: 'bg-[var(--app-border)] border-[var(--app-border)] text-[var(--text-muted)]',
        line: 'bg-[var(--app-border)]',
        title: 'text-[var(--text-muted)] line-through',
      }
    default:
      return {
        dot: 'bg-[var(--surface)] border-[var(--app-border)] text-[var(--text-muted)]',
        line: 'bg-[var(--app-border)]',
        title: 'text-[var(--text-muted)]',
      }
  }
}

function formatEventTime(timestamp?: string | null): string | null {
  if (!timestamp) return null
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const RESTAURANT_LIFECYCLE_KEYS = [
  'orderPlaced',
  'supplierConfirmed',
  'substitutions',
  'processing',
  'shipped',
  'delivered',
  'goodsReceived',
  'dispute',
  'creditNote',
  'invoiceClosed',
] as const

const SUPPLIER_LIFECYCLE_KEYS = [
  'orderReceived',
  'acknowledged',
  'substitutions',
  'picking',
  'shipped',
  'delivered',
  'restaurantReceipt',
  'dispute',
] as const

const LIFECYCLE_EVENT_IDS: Record<string, string[]> = {
  orderPlaced: ['placed'],
  orderReceived: ['placed'],
  supplierConfirmed: ['confirmed'],
  acknowledged: ['confirmed'],
  substitutions: ['substitution'],
  processing: ['processing'],
  picking: ['processing'],
  shipped: ['shipped'],
  delivered: ['delivered'],
  goodsReceived: ['received'],
  restaurantReceipt: ['restaurant-received'],
  dispute: ['dispute'],
  creditNote: ['credit'],
  invoiceClosed: ['invoice'],
}

function lifecycleHit(events: TimelineEvent[], key: string): boolean {
  const ids = LIFECYCLE_EVENT_IDS[key]
  if (!ids) return false
  return events.some(
    (e) => ids.some((id) => e.id === id || e.id.startsWith(`${id}-`)) && e.state !== 'upcoming'
  )
}

function TimelineStep({
  event,
  isLast,
  t,
}: {
  event: TimelineEvent
  isLast: boolean
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = eventIcon(event.title)
  const styles = stateStyles(event.state)
  const timeLabel = formatEventTime(event.timestamp)

  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      {!isLast && (
        <span className={`absolute left-[15px] top-8 bottom-0 w-0.5 ${styles.line}`} aria-hidden />
      )}

      <div
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${styles.dot}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`text-sm ${styles.title}`}>{event.title}</h4>
            {event.badge && (
              <Badge variant="outline" className="text-xs capitalize">
                {event.badge}
              </Badge>
            )}
            {event.state === 'current' && (
              <Badge variant="secondary" className="text-xs">
                {t('timeline.inProgress')}
              </Badge>
            )}
          </div>
          {timeLabel && <p className="text-xs text-[var(--text-muted)] mt-0.5">{timeLabel}</p>}
        </div>

        {event.description && (
          <p className="text-sm text-[var(--text-muted)] mt-1">{event.description}</p>
        )}

        {event.substitutions && event.substitutions.length > 0 && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto px-0 text-[var(--brand)]"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? t('timeline.hideDetails') : t('timeline.viewSubstitutionDetails')}
            </Button>
            {expanded && (
              <div className="mt-2 space-y-2 rounded-lg border border-[var(--app-border)] p-3 text-sm">
                {event.substitutions.map((sub, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <span className="text-[var(--text-muted)] line-through">
                      {sub.originalName}
                    </span>
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className="font-medium">{sub.substituteName}</span>
                    {sub.quantity != null && (
                      <span className="text-[var(--text-muted)]">
                        · {t('timeline.qty', { count: sub.quantity })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {event.link && (
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link to={event.link.href}>{event.link.label}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

export function OrderOperationsTimeline({
  events,
  viewerRole = 'RESTAURANT',
}: {
  events: TimelineEvent[]
  viewerRole?: TimelineViewerRole
}) {
  const { t } = useTranslation('orders')
  const lifecycleKeys =
    viewerRole === 'SUPPLIER' ? SUPPLIER_LIFECYCLE_KEYS : RESTAURANT_LIFECYCLE_KEYS
  const description =
    viewerRole === 'SUPPLIER'
      ? t('timeline.supplierDescription')
      : t('timeline.restaurantDescription')

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_220px]" data-testid="order-timeline">
      <Card className="xl:order-1">
        <CardHeader>
          <CardTitle>{t('timeline.title')}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('timeline.noEvents')}</p>
          ) : (
            <div className="mt-2">
              {events.map((event, index) => (
                <TimelineStep
                  key={event.id}
                  event={event}
                  isLast={index === events.length - 1}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit xl:order-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            {t('timeline.lifecycleTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lifecycleKeys.map((key) => {
            const hit = lifecycleHit(events, key)
            return (
              <div
                key={key}
                className={`flex items-center gap-2 text-sm ${
                  hit ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    hit ? 'bg-[var(--mint)]' : 'bg-[var(--app-border)]'
                  }`}
                />
                {t(`timeline.lifecycle.${key}`)}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
