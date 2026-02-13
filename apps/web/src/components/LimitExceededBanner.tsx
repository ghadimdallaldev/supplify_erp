import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { useNavigate } from 'react-router-dom'

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
  chats_per_day: 'Daily messages',
  supplier_products_skus: 'Products',
  restaurant_inventory_skus: 'Inventory SKUs',
  branches: 'Branches',
  warehouses: 'Warehouses',
  users: 'Users',
  storage_mb: 'Storage',
  suppliers_per_restaurant: 'Suppliers',
}

export function LimitExceededBanner({
  limitKey,
  currentUsage,
  limitValue,
  currentPlan,
  recommendedPlans = [],
  upgradeUrl = '/app/settings',
  className = '',
}: LimitExceededBannerProps) {
  const navigate = useNavigate()
  const label = LIMIT_LABELS[limitKey] || limitKey.replace(/_/g, ' ')

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 ${className}`}
      role="alert"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-medium">Limit reached: {label}</p>
          <p className="text-sm text-amber-800">
            {currentUsage} / {limitValue} used
            {currentPlan && ` on ${currentPlan}`}
          </p>
          {recommendedPlans.length > 0 && (
            <p className="text-xs text-amber-700 mt-0.5">
              Upgrade to {recommendedPlans.slice(0, 2).join(' or ')} for higher limits.
            </p>
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-amber-300 bg-white hover:bg-amber-100"
        onClick={() => navigate(upgradeUrl)}
      >
        Upgrade
      </Button>
    </div>
  )
}
