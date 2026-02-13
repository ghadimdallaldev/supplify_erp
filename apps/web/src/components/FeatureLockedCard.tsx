import { Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
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
  const planToUnlock = upgradeCopy?.plan ?? recommendedPlans[0] ?? 'Gold'
  const valueProp = upgradeCopy?.value

  return (
    <Card className={`border-amber-200 bg-amber-50/50 ${className}`} title={valueProp ?? undefined}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2" title={valueProp ?? undefined}>
          <Lock className="h-5 w-5 text-amber-600" aria-hidden />
          <CardTitle className="text-lg">{displayName}</CardTitle>
        </div>
        <CardDescription>
          This feature is not available on your current plan{currentPlan ? ` (${currentPlan})` : ''}
          .
          {recommendedPlans.length > 0 && (
            <> Upgrade to {recommendedPlans.slice(0, 2).join(' or ')} to unlock it.</>
          )}
        </CardDescription>
        {valueProp && (
          <p className="text-sm text-amber-800 mt-2" role="tooltip">
            {valueProp}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        <Button
          variant="outline"
          className="border-amber-300"
          onClick={() => navigate(upgradeUrl)}
          title={valueProp ?? `Upgrade to ${planToUnlock} to unlock ${displayName}`}
        >
          View plans
        </Button>
      </CardContent>
    </Card>
  )
}
