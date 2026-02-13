import { Lock } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { useNavigate } from 'react-router-dom'

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

  return (
    <Card className={`border-amber-200 bg-amber-50/50 ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-amber-600" />
          <CardTitle className="text-lg">{displayName}</CardTitle>
        </div>
        <CardDescription>
          This feature is not available on your current plan{currentPlan ? ` (${currentPlan})` : ''}.
          {recommendedPlans.length > 0 && (
            <> Upgrade to {recommendedPlans.slice(0, 2).join(' or ')} to unlock it.</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        <Button
          variant="outline"
          className="border-amber-300"
          onClick={() => navigate(upgradeUrl)}
        >
          View plans
        </Button>
      </CardContent>
    </Card>
  )
}
