import { useGetMyReviewsQuery } from '../../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Star } from 'lucide-react'
import { OnboardingTabLoading } from './onboardingShared'

export function OnboardingReviewsTab() {
  const { data: myReviewsData, isLoading } = useGetMyReviewsQuery({ limit: 20 })

  if (isLoading) {
    return <OnboardingTabLoading />
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>My supplier reviews</CardTitle>
          <CardDescription>Reviews you have submitted after completed orders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(myReviewsData?.reviews || []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              You have not written any reviews yet.
            </p>
          ) : (
            (myReviewsData?.reviews || []).map((r: Record<string, unknown>) => (
              <div key={String(r.id)} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-1 text-amber-600">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < Number(r.overall_rating || 0) ? 'fill-amber-400' : 'text-amber-200'}`}
                    />
                  ))}
                </div>
                <p className="font-medium mt-1">{String(r.supplier_name || 'Supplier')}</p>
                {r.comment ? (
                  <p className="text-[var(--text-muted)] mt-1">{String(r.comment)}</p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
