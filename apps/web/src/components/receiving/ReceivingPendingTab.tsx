import { PackageCheck } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { ReceivingPendingOrderRow } from './ReceivingPendingOrderRow'

type ReceivingPendingTabProps = {
  pendingLoading: boolean
  pendingOrders: any[]
  receivingOrderIds: Set<string>
  canReceive: boolean
  isCreating: boolean
  onReceive: (order: any) => void
}

export function ReceivingPendingTab({
  pendingLoading,
  pendingOrders,
  receivingOrderIds,
  canReceive,
  isCreating,
  onReceive,
}: ReceivingPendingTabProps) {
  if (pendingLoading) {
    return (
      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <div
          className="divide-y divide-[var(--app-border)]"
          data-testid="receiving-pending-loading"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (pendingOrders.length === 0) {
    return (
      <EmptyState
        title="No orders awaiting receiving"
        description="Delivered orders ready to receive will show up here."
        icon={<PackageCheck className="h-6 w-6" aria-hidden />}
      />
    )
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
      data-testid="receiving-pending-list"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Pending deliveries</h2>
        <p className="text-xs tabular-nums text-[var(--text-muted)]">
          {pendingOrders.length} order{pendingOrders.length === 1 ? '' : 's'}
        </p>
      </header>
      <div className="divide-y divide-[var(--app-border)]">
        {pendingOrders.map((order: any) => (
          <ReceivingPendingOrderRow
            key={order.id}
            order={order}
            isProcessing={receivingOrderIds.has(order.id)}
            canReceive={canReceive}
            isCreating={isCreating}
            onReceive={onReceive}
          />
        ))}
      </div>
    </section>
  )
}
