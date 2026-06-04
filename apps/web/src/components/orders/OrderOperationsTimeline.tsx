import { useState } from 'react'
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
import { RESTAURANT_LIFECYCLE_LABELS, SUPPLIER_LIFECYCLE_LABELS } from '../../lib/orderTimeline'

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

const LIFECYCLE_EVENT_IDS: Record<string, string[]> = {
  'Order placed': ['placed'],
  'Order received': ['placed'],
  'Supplier confirmed': ['confirmed'],
  Acknowledged: ['confirmed'],
  Substitutions: ['substitution'],
  Processing: ['processing'],
  Picking: ['processing'],
  Shipped: ['shipped'],
  Delivered: ['delivered'],
  'Goods received': ['received'],
  'Restaurant receipt': ['restaurant-received'],
  Dispute: ['dispute'],
  'Credit note': ['credit'],
  'Invoice closed': ['invoice'],
}

function lifecycleHit(events: TimelineEvent[], label: string): boolean {
  const ids = LIFECYCLE_EVENT_IDS[label]
  if (!ids) return false
  return events.some(
    (e) => ids.some((id) => e.id === id || e.id.startsWith(`${id}-`)) && e.state !== 'upcoming'
  )
}

function TimelineStep({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
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
                In progress
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
              {expanded ? 'Hide details' : 'View substitution details'}
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
                      <span className="text-[var(--text-muted)]">· qty {sub.quantity}</span>
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
  const lifecycleLabels =
    viewerRole === 'SUPPLIER' ? SUPPLIER_LIFECYCLE_LABELS : RESTAURANT_LIFECYCLE_LABELS
  const description =
    viewerRole === 'SUPPLIER'
      ? 'Fulfillment progress from order receipt through dispatch and delivery.'
      : 'Order progress from placement through delivery, receiving, and billing.'

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_220px]">
      <Card className="xl:order-1">
        <CardHeader>
          <CardTitle>Operations timeline</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No timeline events yet.</p>
          ) : (
            <div className="mt-2">
              {events.map((event, index) => (
                <TimelineStep key={event.id} event={event} isLast={index === events.length - 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit xl:order-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-[var(--text-muted)]">
            Order lifecycle
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {lifecycleLabels.map((label) => {
            const hit = lifecycleHit(events, label)
            return (
              <div
                key={label}
                className={`flex items-center gap-2 text-sm ${
                  hit ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    hit ? 'bg-[var(--mint)]' : 'bg-[var(--app-border)]'
                  }`}
                />
                {label}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
