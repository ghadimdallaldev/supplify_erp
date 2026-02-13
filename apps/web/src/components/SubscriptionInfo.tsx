import { useGetEntitlementsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { AlertCircle, AlertTriangle, Infinity, TrendingUp } from 'lucide-react'

const LIMIT_LABELS: Record<string, string> = {
  branches: 'Branches',
  users: 'Users',
  orders_per_day: 'Orders (Today)',
  suppliers_per_restaurant: 'Suppliers',
  restaurant_inventory_skus: 'Inventory SKUs',
  warehouses: 'Warehouses',
  supplier_products_skus: 'Products',
  chats_per_day: 'Chats (Today)',
  storage_mb: 'Storage (MB)',
}

export function SubscriptionInfo() {
  const { data, isLoading, error } = useGetEntitlementsQuery()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Loading subscription details...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (error || !data?.entitlements) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>No active subscription found</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">None</Badge>
        </CardContent>
      </Card>
    )
  }

  const e = data.entitlements
  const plan = e.plan
  const limits = e.limits
  const usage = e.usage
  const features = e.features

  const getFeatureDisplay = (value: boolean) => (value ? 'Enabled' : 'Disabled')

  const limitEntries = Object.entries(limits).filter(
    ([_, limit]) => limit !== null && limit !== undefined
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription & Usage</CardTitle>
        <CardDescription>
          {e.tenantType === 'RESTAURANT' ? 'Restaurant' : 'Supplier'} plan limits and usage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Info */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold text-lg">{plan.name || 'Free'}</h3>
              <p className="text-sm text-gray-600">Current Plan</p>
            </div>
            <Badge variant="outline">
              {e.tenantType === 'RESTAURANT' ? 'Restaurant' : 'Supplier'}
            </Badge>
          </div>
          {plan.price_monthly != null && (
            <p className="text-sm text-gray-600">
              ${plan.price_monthly}/mo
              {plan.price_yearly != null && plan.price_yearly > 0 && ` · $${plan.price_yearly}/yr`}
            </p>
          )}
          {e.overrides.length > 0 && (
            <p className="text-xs text-amber-600 mt-2">
              {e.overrides.length} limit override{e.overrides.length !== 1 ? 's' : ''} applied
            </p>
          )}
        </div>

        {/* Usage */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Usage
          </h4>

          {limitEntries.map(([limitKey, limit]) => {
            const current = usage[limitKey] ?? 0
            const effectiveLimit = limit === -1 ? null : limit
            if (effectiveLimit === null) return null
            const pct = effectiveLimit > 0 ? (current / effectiveLimit) * 100 : 0
            const isOver = current >= effectiveLimit
            const isWarning = pct >= 80 && pct < 100
            const label = LIMIT_LABELS[limitKey] ?? limitKey.replace(/_/g, ' ')
            return (
              <div key={limitKey} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{label}</span>
                  <span
                    className={
                      isOver ? 'text-red-600 font-medium' : isWarning ? 'text-amber-600' : ''
                    }
                  >
                    {current} / {effectiveLimit}
                  </span>
                </div>
                <Progress
                  value={Math.min(pct, 100)}
                  className={isOver ? 'bg-red-200' : isWarning ? 'bg-amber-100' : ''}
                />
                {isOver && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Limit exceeded
                  </div>
                )}
                {isWarning && !isOver && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Near limit
                  </div>
                )}
              </div>
            )
          })}

          {limitEntries.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Infinity className="w-4 h-4" />
              Unlimited access on this plan
            </div>
          )}
        </div>

        {/* Key Features */}
        <div className="space-y-4">
          <h4 className="font-semibold">Key Features</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Chat:</span>{' '}
              <Badge variant={features.chat ? 'default' : 'secondary'} className="ml-2">
                {getFeatureDisplay(features.chat)}
              </Badge>
            </div>
            <div>
              <span className="text-gray-600">Smart Reorder:</span>{' '}
              <Badge variant={features.smart_reorder ? 'default' : 'secondary'} className="ml-2">
                {getFeatureDisplay(features.smart_reorder)}
              </Badge>
            </div>
            <div>
              <span className="text-gray-600">Analytics:</span>{' '}
              <Badge variant={features.reports ? 'default' : 'secondary'} className="ml-2">
                {getFeatureDisplay(features.reports)}
              </Badge>
            </div>
            <div>
              <span className="text-gray-600">Multi-Branch:</span>{' '}
              <Badge variant={features.multi_branch ? 'default' : 'secondary'} className="ml-2">
                {getFeatureDisplay(features.multi_branch)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Upgrade CTA */}
        {plan.name === 'Free' && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm">
            <p className="text-blue-800 font-medium mb-2">Upgrade to unlock more features</p>
            <p className="text-blue-700">
              Bronze, Gold, and Platinum plans offer advanced features, higher limits, and more.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
