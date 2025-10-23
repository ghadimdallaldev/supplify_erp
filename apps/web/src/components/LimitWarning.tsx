'use client';

import { AlertTriangle, TrendingUp } from 'lucide-react';
import { formatLimitName, PLAN_NAMES } from '@supplify/entitlements';
import type { LimitCaps, PlanCode } from '@supplify/entitlements';

interface LimitWarningProps {
  limit: keyof LimitCaps;
  current: number;
  cap: number;
  suggestedTier?: PlanCode;
  onUpgradeRequest?: () => void;
}

/**
 * Limit Warning Component
 * Shows when approaching or exceeding a subscription limit
 */
export function LimitWarning({
  limit,
  current,
  cap,
  suggestedTier = 'PRO',
  onUpgradeRequest,
}: LimitWarningProps) {
  const usagePercent = (current / cap) * 100;
  const isAtLimit = current >= cap;
  const isNearLimit = usagePercent >= 80;

  const limitLabel = formatLimitName(limit);
  const tierName = PLAN_NAMES[suggestedTier];

  if (!isNearLimit && !isAtLimit) {
    return null;
  }

  return (
    <div className={`rounded-lg border p-4 ${
      isAtLimit 
        ? 'bg-red-50 border-red-200' 
        : 'bg-yellow-50 border-yellow-200'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-full p-2 flex-shrink-0 ${
          isAtLimit ? 'bg-red-100' : 'bg-yellow-100'
        }`}>
          <AlertTriangle className={`h-5 w-5 ${
            isAtLimit ? 'text-red-600' : 'text-yellow-600'
          }`} />
        </div>

        <div className="flex-1">
          <h3 className={`font-semibold mb-1 ${
            isAtLimit ? 'text-red-900' : 'text-yellow-900'
          }`}>
            {isAtLimit ? 'Limit Reached' : 'Approaching Limit'}
          </h3>

          <p className={`text-sm mb-3 ${
            isAtLimit ? 'text-red-700' : 'text-yellow-700'
          }`}>
            You're {isAtLimit ? 'at' : 'approaching'} your <strong>{limitLabel}</strong> limit:{' '}
            <span className="font-mono font-semibold">
              {current} / {cap}
            </span>
          </p>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isAtLimit ? 'bg-red-600' : 'bg-yellow-500'
                }`}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 mt-1">
              {usagePercent.toFixed(1)}% used
            </p>
          </div>

          {isAtLimit ? (
            <div className="bg-white/50 rounded-lg p-3 mb-3">
              <p className="text-sm text-gray-900 mb-2">
                <strong>Upgrade to {tierName}</strong> to increase your limits:
              </p>
              <ul className="text-xs text-gray-700 space-y-1">
                <li>✓ {getUpgradedLimit(limit, suggestedTier)} {limitLabel.toLowerCase()}</li>
                <li>✓ Advanced features unlocked</li>
                <li>✓ Priority support</li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-gray-700 mb-3">
              Consider upgrading soon to avoid disruption.
            </p>
          )}

          {onUpgradeRequest && (
            <button
              onClick={onUpgradeRequest}
              className={`text-sm font-medium py-2 px-4 rounded-lg transition-colors inline-flex items-center ${
                isAtLimit
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-yellow-600 hover:bg-yellow-700 text-white'
              }`}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              Upgrade to {tierName}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Get upgraded limit for display
 */
function getUpgradedLimit(limit: keyof LimitCaps, tier: PlanCode): string {
  const upgradedLimits: Record<PlanCode, Record<keyof LimitCaps, number>> = {
    BASIC: {
      products: 500,
      promotionsActive: 0,
      pinnedPerSupplier: 20,
      favoriteLists: 5,
      users: 3,
      apiRateRps: 2,
      storageGB: 5,
    },
    PRO: {
      products: 5000,
      promotionsActive: 5,
      pinnedPerSupplier: 100,
      favoriteLists: 50,
      users: 10,
      apiRateRps: 5,
      storageGB: 50,
    },
    PREMIUM: {
      products: 50000,
      promotionsActive: 50,
      pinnedPerSupplier: 500,
      favoriteLists: 200,
      users: 100,
      apiRateRps: 25,
      storageGB: 500,
    },
  };

  return upgradedLimits[tier][limit].toLocaleString();
}

