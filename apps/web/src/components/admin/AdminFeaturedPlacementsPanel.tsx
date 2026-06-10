import { useGetAdminFeaturedPlacementsQuery } from '../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { Badge } from '../ui/badge'
import { Sparkles } from 'lucide-react'

export function AdminFeaturedPlacementsPanel() {
  const { data, isLoading } = useGetAdminFeaturedPlacementsQuery()
  const placements = data?.placements ?? []

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
                <Badge variant="outline">{p.pricing_key}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
