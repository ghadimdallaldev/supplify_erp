import { useAppSelector, useAppDispatch } from '../hooks/redux'
import { closeMonetizationModal } from '../features/monetization/monetizationSlice'
import { useGetRecommendationQuery, useRecordConversionEventMutation } from '../services/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { useNavigate } from 'react-router-dom'
import { Lock, TrendingUp } from 'lucide-react'
import { useEffect } from 'react'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  bronze: 'Bronze',
  gold: 'Gold',
  platinum: 'Platinum',
}

const LIMIT_KEY_LABELS: Record<string, string> = {
  orders_per_day: 'Daily orders',
  chats_per_day: 'Daily messages',
  supplier_products_skus: 'Products',
  restaurant_inventory_skus: 'Inventory SKUs',
  branches: 'Branches',
  warehouses: 'Warehouses',
  users: 'Users',
  storage_mb: 'Storage',
  suppliers_per_restaurant: 'Suppliers',
}

export function UpgradeModal() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { open, type, payload } = useAppSelector((state) => state.monetization)
  const user = useAppSelector((state) => state.auth.user)
  const canUpgrade = true
  const { data: recommendation } = useGetRecommendationQuery(
    {
      blocked:
        type === 'limit' && payload && 'limitKey' in payload
          ? `limit:${(payload as { limitKey: string }).limitKey}`
          : type === 'feature' && payload && 'featureKey' in payload
            ? `feature:${(payload as { featureKey: string }).featureKey}`
            : undefined,
    },
    { skip: !open }
  )
  const [recordConversionEvent] = useRecordConversionEventMutation()
  useEffect(() => {
    if (open) recordConversionEvent({ eventType: 'OPEN_UPGRADE' }).catch(() => {})
  }, [open, recordConversionEvent])

  const handleClose = () => dispatch(closeMonetizationModal())
  const handleUpgrade = () => {
    handleClose()
    const path = (payload as { upgradeUrl?: string })?.upgradeUrl || '/app/settings'
    navigate(path.startsWith('/') ? path : `/app/${path}`)
  }

  if (!payload) return null

  const currentPlan = (payload as { currentPlan?: string }).currentPlan || 'Current plan'
  const recommendedPlans = (payload as { recommendedPlans?: string[] }).recommendedPlans || []

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === 'limit' ? (
              <TrendingUp className="h-5 w-5 text-amber-600" />
            ) : (
              <Lock className="h-5 w-5 text-amber-600" />
            )}
            {type === 'limit' ? 'Limit reached' : 'Feature not available'}
          </DialogTitle>
          <DialogDescription>
            {type === 'limit'
              ? `You've reached your plan limit. Upgrade to get more.`
              : `This feature isn't included in your current plan.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-700">Current plan: {currentPlan}</p>
            {type === 'limit' && 'limitKey' in payload && (
              <p className="mt-1 text-gray-600">
                {LIMIT_KEY_LABELS[payload.limitKey] || payload.limitKey}: {payload.currentUsage} /{' '}
                {payload.limitValue}
              </p>
            )}
            {type === 'feature' && 'featureKey' in payload && (
              <p className="mt-1 text-gray-600">Feature: {payload.featureKey.replace(/_/g, ' ')}</p>
            )}
          </div>
          {(recommendation?.recommendedPlanCode || recommendedPlans.length > 0) && (
            <div>
              <p className="text-sm font-medium text-gray-700">
                {recommendation?.recommendedPlanCode ? (
                  <>
                    Recommended:{' '}
                    <span className="font-semibold">
                      {PLAN_LABELS[recommendation.recommendedPlanCode] ??
                        recommendation.recommendedPlanCode}
                    </span>
                  </>
                ) : (
                  'Upgrade to unlock:'
                )}
              </p>
              {recommendation?.reason && (
                <p className="text-sm text-gray-600 mt-1">{recommendation.reason}</p>
              )}
              {recommendedPlans.length > 0 && !recommendation?.recommendedPlanCode && (
                <p className="text-sm text-gray-600">{recommendedPlans.join(', ')}</p>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleUpgrade} className="flex-1">
              {canUpgrade ? 'Upgrade' : 'Contact admin'}
            </Button>
            <Button variant="outline" onClick={handleClose}>
              Dismiss
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
