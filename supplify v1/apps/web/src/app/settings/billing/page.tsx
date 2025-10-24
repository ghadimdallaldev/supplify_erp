'use client';

import { useEntitlements, useLimit } from '@/hooks/useEntitlements';
import { Check, X, TrendingUp, Users, Package, Star } from 'lucide-react';
import { formatLimitName } from '@supplify/entitlements';

/**
 * Organization Billing & Settings Page
 * Shows current plan, entitlements, and usage
 */
export default function BillingPage() {
  const { data: entitlements, isLoading } = useEntitlements('SUPPLIER');

  // Example usage data (would come from API)
  const usage = {
    products: 420,
    promotionsActive: 3,
    pinnedPerSupplier: 15,
    users: 7,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!entitlements) {
    return <div>Error loading entitlements</div>;
  }

  // Determine current plan from entitlements
  const currentPlan = entitlements.limits.products >= 50000 ? 'PREMIUM' 
    : entitlements.limits.products >= 5000 ? 'PRO' 
    : 'BASIC';

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-600 mt-2">Manage your plan and view usage</p>
        </div>

        {/* Current Plan Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {currentPlan} Plan
              </h2>
              <p className="text-gray-600 mt-1">Current subscription tier</p>
            </div>
            <div className="bg-blue-100 rounded-full px-4 py-2">
              <span className="text-blue-700 font-semibold">Active</span>
            </div>
          </div>

          {/* Features Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                Features Included
              </h3>
              <ul className="space-y-2">
                {Object.entries(entitlements.features).map(([key, enabled]) => (
                  <li key={key} className="flex items-center text-sm">
                    {enabled ? (
                      <Check className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" />
                    )}
                    <span className={enabled ? 'text-gray-900' : 'text-gray-400'}>
                      {formatFeatureName(key as any)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">
                Usage & Limits
              </h3>
              <div className="space-y-4">
                <UsageMeter
                  label="Products"
                  icon={<Package className="h-4 w-4" />}
                  current={usage.products}
                  cap={entitlements.limits.products}
                />
                <UsageMeter
                  label="Active Promotions"
                  icon={<TrendingUp className="h-4 w-4" />}
                  current={usage.promotionsActive}
                  cap={entitlements.limits.promotionsActive}
                />
                <UsageMeter
                  label="Pinned Products"
                  icon={<Star className="h-4 w-4" />}
                  current={usage.pinnedPerSupplier}
                  cap={entitlements.limits.pinnedPerSupplier}
                />
                <UsageMeter
                  label="Team Members"
                  icon={<Users className="h-4 w-4" />}
                  current={usage.users}
                  cap={entitlements.limits.users}
                />
              </div>
            </div>
          </div>

          {/* Upgrade CTA */}
          {currentPlan !== 'PREMIUM' && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Need More? Upgrade to {currentPlan === 'BASIC' ? 'Pro' : 'Premium'}
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                Get higher limits, advanced features, and priority support.
              </p>
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors">
                Contact Sales
              </button>
            </div>
          )}
        </div>

        {/* Plan Comparison */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Plan Comparison</h2>
          <PlanComparisonTable currentPlan={currentPlan} />
        </div>
      </div>
    </div>
  );
}

/**
 * Usage Meter Component
 */
function UsageMeter({
  label,
  icon,
  current,
  cap,
}: {
  label: string;
  icon: React.ReactNode;
  current: number;
  cap: number;
}) {
  const percent = cap > 0 ? (current / cap) * 100 : 0;
  const isNearLimit = percent >= 80;
  const isAtLimit = current >= cap;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
          {icon}
          {label}
        </span>
        <span className={`text-sm font-mono ${
          isAtLimit ? 'text-red-600' : isNearLimit ? 'text-yellow-600' : 'text-gray-600'
        }`}>
          {current} / {cap}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full transition-all ${
            isAtLimit ? 'bg-red-600' : isNearLimit ? 'bg-yellow-500' : 'bg-blue-600'
          }`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Plan Comparison Table
 */
function PlanComparisonTable({ currentPlan }: { currentPlan: string }) {
  const plans = [
    { code: 'BASIC', name: 'Basic', products: 500, promotions: 0, users: 3, price: 'Free' },
    { code: 'PRO', name: 'Pro', products: 5000, promotions: 5, users: 10, price: '$99/mo' },
    { code: 'PREMIUM', name: 'Premium', products: 50000, promotions: 50, users: 100, price: '$299/mo' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium text-gray-700">Feature</th>
            {plans.map(plan => (
              <th
                key={plan.code}
                className={`text-center py-3 px-4 ${
                  plan.code === currentPlan ? 'bg-blue-50' : ''
                }`}
              >
                <div className="font-semibold text-gray-900">{plan.name}</div>
                <div className="text-sm text-gray-600">{plan.price}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-3 px-4 text-sm text-gray-700">Active Products</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 text-sm ${
                plan.code === currentPlan ? 'bg-blue-50 font-medium' : ''
              }`}>
                {plan.products.toLocaleString()}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-3 px-4 text-sm text-gray-700">Active Promotions</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 text-sm ${
                plan.code === currentPlan ? 'bg-blue-50 font-medium' : ''
              }`}>
                {plan.promotions}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-3 px-4 text-sm text-gray-700">Team Members</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 text-sm ${
                plan.code === currentPlan ? 'bg-blue-50 font-medium' : ''
              }`}>
                {plan.users}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-3 px-4 text-sm text-gray-700">Inventory Module</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 ${
                plan.code === currentPlan ? 'bg-blue-50' : ''
              }`}>
                {plan.code !== 'BASIC' ? (
                  <Check className="h-5 w-5 text-green-600 mx-auto" />
                ) : (
                  <X className="h-5 w-5 text-gray-400 mx-auto" />
                )}
              </td>
            ))}
          </tr>
          <tr className="border-b">
            <td className="py-3 px-4 text-sm text-gray-700">Advanced Analytics</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 ${
                plan.code === currentPlan ? 'bg-blue-50' : ''
              }`}>
                {plan.code !== 'BASIC' ? (
                  <Check className="h-5 w-5 text-green-600 mx-auto" />
                ) : (
                  <X className="h-5 w-5 text-gray-400 mx-auto" />
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-3 px-4 text-sm text-gray-700">API Access & Webhooks</td>
            {plans.map(plan => (
              <td key={plan.code} className={`text-center py-3 px-4 ${
                plan.code === currentPlan ? 'bg-blue-50' : ''
              }`}>
                {plan.code === 'PREMIUM' ? (
                  <Check className="h-5 w-5 text-green-600 mx-auto" />
                ) : (
                  <X className="h-5 w-5 text-gray-400 mx-auto" />
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Helper to format feature names
 */
function formatFeatureName(key: string): string {
  const labels: Record<string, string> = {
    analyticsAdvanced: 'Advanced Analytics',
    promotions: 'Sponsored Campaigns',
    recommendationsBoost: 'Smart Recommendations',
    loyaltyAdvanced: 'Advanced Loyalty',
    apiAccess: 'API Access',
    webhooks: 'Webhooks',
    inventoryModule: 'Inventory Management',
    pinnedProducts: 'Pinned Products',
    prioritySupport: 'Priority Support',
  };

  return labels[key] || key;
}

