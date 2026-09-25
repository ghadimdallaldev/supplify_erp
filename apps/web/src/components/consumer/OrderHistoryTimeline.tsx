import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import {
  labelForConsumerStatus,
  type ConsumerOrderHistoryEntry,
} from '../../lib/consumerOrderTracking'
import type { ConsumerFulfillmentType } from '../../services/consumerApi'

type OrderHistoryTimelineProps = {
  history: ConsumerOrderHistoryEntry[]
  fulfillmentType?: ConsumerFulfillmentType | string | null
  className?: string
}

export function OrderHistoryTimeline({
  history,
  fulfillmentType,
  className,
}: OrderHistoryTimelineProps) {
  const { t } = useTranslation('consumer')
  if (!history.length) return null

  return (
    <ol className={cn('space-y-3', className)}>
      {history.map((entry, idx) => {
        const label = labelForConsumerStatus(
          (key, options) => t(key, options),
          entry.status,
          fulfillmentType
        )
        return (
          <li key={`${entry.status}-${entry.created_at}-${idx}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="h-2.5 w-2.5 rounded-full bg-[var(--brand-mid)]" />
              {idx < history.length - 1 && (
                <div className="mt-1 w-px flex-1 bg-[var(--app-border)]" />
              )}
            </div>
            <div className="min-w-0 flex-1 pb-3">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </p>
              {entry.notes && <p className="mt-0.5 text-xs text-muted-foreground">{entry.notes}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default OrderHistoryTimeline
