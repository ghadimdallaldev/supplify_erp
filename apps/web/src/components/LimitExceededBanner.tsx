import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { InfoBanner } from './ui/info-banner'
import { getLimitUpgradeCopy } from '../lib/upgradeCopy'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { showMonetizationBlock } from '../features/monetization/monetizationSlice'
import { resolveUpgradeUrl } from '../lib/externallyControlledFeatures'

type LimitExceededBannerProps = {
  limitKey: string
  currentUsage: number
  limitValue: number
  currentPlan?: string | null
  recommendedPlans?: string[]
  upgradeUrl?: string
  className?: string
}

const LIMIT_LABELS: Record<string, string> = {
  orders_per_day: 'Daily orders',
  quick_lists: 'Quick lists',
  quick_list_items: 'Quick list products',
  scheduled_quick_lists: 'Scheduled quick lists',
  chats_per_day: 'Daily chats',
  supplier_products_skus: 'Product SKUs',
  restaurant_inventory_skus: 'Inventory SKUs',
  branches: 'Branches',
  warehouses: 'Warehouses',
  active_customer_locations_monthly: 'Active customer locations',
  users: 'Users',
  drivers: 'Drivers',
  storage_mb: 'Storage',
  suppliers_per_restaurant: 'Suppliers',
}

export function LimitExceededBanner({
  limitKey,
  currentUsage,
  limitValue,
  currentPlan,
  recommendedPlans = [],
  upgradeUrl,
  className = '',
}: LimitExceededBannerProps) {
  const dispatch = useAppDispatch()
  const user = useAppSelector((state) => state.auth.user)
  const label = LIMIT_LABELS[limitKey] || limitKey.replace(/_/g, ' ')
  const upgradeCopy = getLimitUpgradeCopy(limitKey)
  const planToUnlock = upgradeCopy?.plan ?? recommendedPlans[0] ?? 'Scale'
  const valueProp = upgradeCopy?.value
  const resolvedUpgradeUrl = resolveUpgradeUrl(upgradeUrl, null, user?.role)

  const description = (
    <>
      <p>
        {currentUsage} / {limitValue} used
        {currentPlan && ` on ${currentPlan}`}
      </p>
      {recommendedPlans.length > 0 && (
        <p className="mt-0.5">
          Upgrade to {recommendedPlans.slice(0, 2).join(' or ')} for higher limits.
        </p>
      )}
      {valueProp && <p className="mt-1 max-w-md">{valueProp}</p>}
    </>
  )

  return (
    <InfoBanner
      tone="amber"
      icon={AlertTriangle}
      title={`Limit reached: ${label}`}
      description={description}
      className={className}
      action={
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 whitespace-normal border-amber-300 bg-[var(--surface)] hover:bg-amber-100"
          onClick={() =>
            dispatch(
              showMonetizationBlock({
                type: 'limit',
                payload: {
                  limitKey,
                  limitValue,
                  currentUsage,
                  currentPlan: currentPlan ?? null,
                  recommendedPlans,
                  upgradeUrl: resolvedUpgradeUrl,
                },
              })
            )
          }
          title={valueProp ?? `Upgrade to ${planToUnlock} for higher ${label} limit`}
        >
          Upgrade
        </Button>
      }
    />
  )
}
