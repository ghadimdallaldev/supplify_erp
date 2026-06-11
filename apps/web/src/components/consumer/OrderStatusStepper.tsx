import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
  CONSUMER_ORDER_STATUS_CHAIN,
  CONSUMER_ORDER_STATUS_LABELS,
  type ConsumerOrderTrackingStatus,
} from '../../lib/consumerOrderTracking'

type OrderStatusStepperProps = {
  status: string
  className?: string
}

function stepIndex(status: string): number {
  if (status === 'CANCELLED') return -1
  const idx = CONSUMER_ORDER_STATUS_CHAIN.indexOf(status as ConsumerOrderTrackingStatus)
  return idx >= 0 ? idx : 0
}

export function OrderStatusStepper({ status, className }: OrderStatusStepperProps) {
  const currentIdx = stepIndex(status)
  const cancelled = status === 'CANCELLED'

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
                  <div className={cn('h-0.5 flex-1', done || active ? 'bg-primary' : 'bg-muted')} />
                )}
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    done && 'border-primary bg-primary text-primary-foreground',
                    active && 'border-primary bg-background text-primary ring-2 ring-primary/20',
                    upcoming && 'border-muted bg-background text-muted-foreground',
                    cancelled && 'border-muted bg-muted text-muted-foreground'
                  )}
                  aria-current={active ? 'step' : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </div>
                {idx < CONSUMER_ORDER_STATUS_CHAIN.length - 1 && (
                  <div className={cn('h-0.5 flex-1', done ? 'bg-primary' : 'bg-muted')} />
                )}
              </div>
              <span
                className={cn(
                  'mt-1.5 max-w-[4.5rem] truncate text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs',
                  active && 'text-primary',
                  done && 'text-foreground',
                  (upcoming || cancelled) && 'text-muted-foreground'
                )}
              >
                {CONSUMER_ORDER_STATUS_LABELS[step]}
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
