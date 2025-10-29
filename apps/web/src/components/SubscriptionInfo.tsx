import { useGetCurrentSubscriptionQuery, useGetSubscriptionUsageQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Progress } from './ui/progress'
import { AlertCircle, Infinity, TrendingUp } from 'lucide-react'

export function SubscriptionInfo() {
  const { data, isLoading, error } = useGetCurrentSubscriptionQuery()
  const { data: productsUsage } = useGetSubscriptionUsageQuery('products')
  const { data: ordersUsage } = useGetSubscriptionUsageQuery('orders_per_day')

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

  if (error || !data?.subscription) {
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

  const subscription = data.subscription
  const limits = subscription.limits || {}
  const features = subscription.features || {}

  const getFeatureDisplay = (featureValue: any) => {
    if (typeof featureValue === 'boolean') {
      return featureValue ? 'Enabled' : 'Disabled'
    }
    if (typeof featureValue === 'string') {
      return featureValue.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }
    return 'N/A'
  }

  const isUnlimited = (value: number) => value === -1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subscription & Usage</CardTitle>
        <CardDescription>Current plan limits and usage</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Plan Info */}
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-lg">{subscription.plan_name || 'Free'}</h3>
              <p className="text-sm text-gray-600">Current Plan</p>
            </div>
            <Badge variant={subscription.status === 'ACTIVE' ? 'default' : 'secondary'}>
              {subscription.status}
            </Badge>
          </div>
          
          {subscription.current_period_end && (
            <div className="text-sm text-gray-600">
              Renewal: {new Date(subscription.current_period_end).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Usage */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Usage
          </h4>

          {/* Products Usage */}
          {productsUsage && !isUnlimited(limits.products || 0) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Products</span>
                <span className={productsUsage.isOverLimit ? 'text-red-600' : ''}>
                  {productsUsage.current} / {limits.products}
                </span>
              </div>
              <Progress 
                value={limits.products > 0 ? (productsUsage.current / limits.products) * 100 : 0} 
                className={productsUsage.isOverLimit ? 'bg-red-200' : ''}
              />
              {productsUsage.isOverLimit && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  Limit exceeded
                </div>
              )}
            </div>
          )}

          {/* Orders Usage */}
          {ordersUsage && !isUnlimited(limits.orders_per_day || 0) && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Orders (Today)</span>
                <span className={ordersUsage.isOverLimit ? 'text-red-600' : ''}>
                  {ordersUsage.current} / {limits.orders_per_day}
                </span>
              </div>
              <Progress 
                value={limits.orders_per_day > 0 && ordersUsage.current > 0 ? (ordersUsage.current / limits.orders_per_day) * 100 : 0}
                className={ordersUsage.isOverLimit ? 'bg-red-200' : ''}
              />
              {ordersUsage.isOverLimit && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  Limit exceeded
                </div>
              )}
            </div>
          )}

          {/* Unlimited indicators */}
          {(isUnlimited(limits.products || 0) || isUnlimited(limits.orders_per_day || 0)) && (
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
        {subscription.plan_name === 'Free' && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm">
            <p className="text-blue-800 font-medium mb-2">
              💡 Upgrade to unlock more features
            </p>
            <p className="text-blue-700">
              Bronze, Gold, and Platinum plans offer advanced features like unlimited products, 
              priority support, analytics dashboards, and more.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

