import { Lock } from 'lucide-react'
import { Button } from './ui/button'
import { useNavigate } from 'react-router-dom'
import { getFeatureUpgradeCopy } from '../lib/upgradeCopy'

type FeatureLockedCardProps = {
  featureKey: string
  featureName?: string
  currentPlan?: string | null
  recommendedPlans?: string[]
  upgradeUrl?: string
  className?: string
  children?: React.ReactNode
}

export function FeatureLockedCard({
  featureKey,
  featureName,
  currentPlan,
  recommendedPlans = [],
  upgradeUrl = '/app/settings',
  className = '',
  children,
}: FeatureLockedCardProps) {
  const navigate = useNavigate()
  const displayName = featureName || featureKey.replace(/_/g, ' ')
  const upgradeCopy = getFeatureUpgradeCopy(featureKey)
  const planToUnlock = upgradeCopy?.plan ?? recommendedPlans[0] ?? 'Scale'
  const valueProp = upgradeCopy?.value

  return (
    <div
      className={`rounded-xl border border-amber-200 p-4 ${className}`}
      style={{ background: 'var(--amber-pale)' }}
      title={valueProp ?? undefined}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold capitalize text-[var(--text)]">{displayName}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
            {valueProp ? (
              valueProp
            ) : (
              <>
                Not available on your current plan
                {currentPlan ? ` (${currentPlan})` : ''}.
                {recommendedPlans.length > 0 && (
                  <> Upgrade to {recommendedPlans.slice(0, 2).join(' or ')} to unlock.</>
                )}
              </>
            )}
          </p>
        </div>
      </div>
      {children && <div className="mb-3">{children}</div>}
      <Button
        variant="outline"
        size="sm"
        className="border-amber-300 text-amber-900 hover:bg-amber-100 hover:border-amber-400"
        onClick={() => navigate(upgradeUrl)}
        title={valueProp ?? `Upgrade to ${planToUnlock} to unlock ${displayName}`}
      >
        View plans
      </Button>
    </div>
  )
}
