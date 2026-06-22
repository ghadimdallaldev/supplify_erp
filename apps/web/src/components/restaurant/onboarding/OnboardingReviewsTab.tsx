import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGetMyReviewsQuery } from '../../../services/api'
import { AppPanel } from '../../ui/app-panel'
import { Star } from 'lucide-react'
import { OnboardingTabLoading } from './onboardingShared'
import { ensureNamespace } from '../../../i18n'

export function OnboardingReviewsTab() {
  const { t } = useTranslation('onboarding')
  const { data: myReviewsData, isLoading } = useGetMyReviewsQuery({ limit: 20 })

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  if (isLoading) {
    return <OnboardingTabLoading />
  }

  return (
    <div className="space-y-4">
      <AppPanel
        title={t('restaurantReviews.title')}
        description={t('restaurantReviews.description')}
      >
        <div className="space-y-3">
          {(myReviewsData?.reviews || []).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('restaurantReviews.empty')}</p>
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
                <p className="font-medium mt-1">
                  {String(r.supplier_name || t('restaurantReviews.supplierFallback'))}
                </p>
                {r.comment ? (
                  <p className="text-[var(--text-muted)] mt-1">{String(r.comment)}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </AppPanel>
    </div>
  )
}
