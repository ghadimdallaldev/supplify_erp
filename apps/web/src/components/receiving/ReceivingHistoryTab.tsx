import { History, Star } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { EmptyState } from '../ui/empty-state'
import { Skeleton } from '../ui/skeleton'
import { formatPrice } from '../../utils/format'

type ReceivingHistoryTabProps = {
  historyLoading: boolean
  historyReports: any[]
}

export function ReceivingHistoryTab({ historyLoading, historyReports }: ReceivingHistoryTabProps) {
  if (historyLoading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    )
  }

  if (historyReports.length === 0) {
    return (
      <EmptyState
        title="No receiving history"
        description="Completed receiving reports will appear here."
        icon={<History className="h-10 w-10" aria-hidden />}
      />
    )
  }

  return (
    <div className="grid gap-4">
      {historyReports.map((report: any) => (
        <Card key={report.id}>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  Order #{report.order_id?.slice(0, 8) || 'N/A'}
                  <Badge variant="outline">{report.supplier_name}</Badge>
                </CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Received: {new Date(report.received_at).toLocaleString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {report.quality_score && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-medium">{report.quality_score}</span>
                  </div>
                )}
                <Badge variant={report.status === 'ACCEPTED' ? 'default' : 'secondary'}>
                  {report.status}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 text-sm xs:grid-cols-3 xs:gap-4">
              <div>
                <p className="text-[var(--text-muted)]">Items Ordered</p>
                <p className="font-semibold">{report.total_items_ordered}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Items Received</p>
                <p className="font-semibold">{report.total_items_received}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Total Cost</p>
                <p className="font-semibold">{formatPrice(report.total_actual_cost)}</p>
              </div>
            </div>
            {report.delivery_notes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-[var(--text-muted)] mb-2">Delivery Notes:</p>
                <p className="text-sm">{report.delivery_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
