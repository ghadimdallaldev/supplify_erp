import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { ReceivingHistoryEmptyIcon, ReceivingHistoryRow } from './ReceivingHistoryRow'

type ReceivingHistoryTabProps = {
  historyLoading: boolean
  historyReports: any[]
}

export function ReceivingHistoryTab({ historyLoading, historyReports }: ReceivingHistoryTabProps) {
  if (historyLoading) {
    return (
      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <div
          className="divide-y divide-[var(--app-border)]"
          data-testid="receiving-history-loading"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (historyReports.length === 0) {
    return (
      <EmptyState
        title="No receiving history"
        description="Completed receiving reports will appear here."
        icon={<ReceivingHistoryEmptyIcon />}
      />
    )
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
      data-testid="receiving-history-list"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">Receiving history</h2>
        <p className="text-xs tabular-nums text-[var(--text-muted)]">
          {historyReports.length} report{historyReports.length === 1 ? '' : 's'}
        </p>
      </header>
      <div className="divide-y divide-[var(--app-border)]">
        {historyReports.map((report: any) => (
          <ReceivingHistoryRow key={report.id} report={report} />
        ))}
      </div>
    </section>
  )
}
