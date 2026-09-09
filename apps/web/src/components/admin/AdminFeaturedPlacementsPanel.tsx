import {
  useGetAdminFeaturedPlacementsQuery,
  useRefundFeaturedPlacementMutation,
} from '../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useState } from 'react'

export function AdminFeaturedPlacementsPanel() {
  const { data, isLoading, refetch } = useGetAdminFeaturedPlacementsQuery()
  const [refundFeatured] = useRefundFeaturedPlacementMutation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const placements = data?.placements ?? []

  const handleRefund = async (id: string) => {
    setBusyId(id)
    try {
      await refundFeatured({ id, reason: 'admin_refund' }).unwrap()
      toast.success('Featured placement refunded')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Refund failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card data-testid="admin-featured-placements-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Active featured placements
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : placements.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No active featured placements</p>
        ) : (
          <ul className="divide-y divide-[var(--app-border)]">
            {placements.map((p: any) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.supplier_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    Until {new Date(p.ends_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{p.pricing_key}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === p.id}
                    onClick={() => handleRefund(p.id)}
                  >
                    {busyId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refund'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
