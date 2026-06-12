import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  CONSUMER_ORDER_STATUS_CHAIN,
  getConsumerStatusLabels,
  type ConsumerOrderTrackingStatus,
} from '../../lib/consumerOrderTracking'
import type { ConsumerFulfillmentType } from '../../services/consumerApi'

type OrderStatusStepperProps = {
  status: string
  fulfillmentType?: ConsumerFulfillmentType | string | null
  className?: string
}

function stepIndex(status: string): number {
  if (status === 'CANCELLED') return -1
  const idx = CONSUMER_ORDER_STATUS_CHAIN.indexOf(status as ConsumerOrderTrackingStatus)
  return idx >= 0 ? idx : 0
}

export function OrderStatusStepper({
  status,
  fulfillmentType,
  className,
}: OrderStatusStepperProps) {
  const currentIdx = stepIndex(status)
  const cancelled = status === 'CANCELLED'
  const labels = getConsumerStatusLabels(fulfillmentType)

  return (
    <div className={cn('w-full', className)} aria-label="Order status">
      <div className="flex items-start justify-between gap-1">
        {CONSUMER_ORDER_STATUS_CHAIN.map((step, idx) => {
          const done = !cancelled && idx < currentIdx
          const active = !cancelled && idx === currentIdx
          const upcoming = !cancelled && idx > currentIdx

          return (
            <div key={step} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {idx > 0 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1',
                      done || active ? 'bg-[var(--brand-mid)]' : 'bg-muted'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    done && 'border-[var(--brand-mid)] bg-[var(--brand-mid)] text-white',
                    active &&
                      'border-[var(--brand-mid)] bg-background text-[var(--brand-mid)] ring-2 ring-[var(--brand-pale)]',
                    upcoming && 'border-muted bg-background text-muted-foreground',
                    cancelled && 'border-muted bg-muted text-muted-foreground'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                {idx < CONSUMER_ORDER_STATUS_CHAIN.length - 1 && (
                  <div
                    className={cn('h-0.5 flex-1', done ? 'bg-[var(--brand-mid)]' : 'bg-muted')}
                  />
                )}
              </div>
              <span
                className={cn(
                  'mt-1.5 max-w-[4.5rem] text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs',
                  active && 'text-[var(--brand-mid)]',
                  done && 'text-foreground',
                  (upcoming || cancelled) && 'text-muted-foreground'
                )}
              >
                {labels[step]}
              </span>
            </div>
          )
        })}
      </div>
      {cancelled && (
        <p className="mt-3 text-center text-sm font-medium text-destructive">Order cancelled</p>
      )}
    </div>
  )
}

export default OrderStatusStepper
