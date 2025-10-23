'use client';

import { AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { PLAN_NAMES } from '@supplify/entitlements';
import type { PlanCode } from '@supplify/entitlements';

interface UpgradeBannerProps {
  feature?: string;
  requiredTier: PlanCode;
  currentTier?: PlanCode;
  variant?: 'banner' | 'modal' | 'inline';
  onRequestUpgrade?: () => void;
}

/**
 * Upgrade Banner Component
 * Shows when a feature is locked due to subscription tier
 */
export function UpgradeBanner({
  feature = 'this feature',
  requiredTier,
  currentTier = 'BASIC',
  variant = 'banner',
  onRequestUpgrade,
}: UpgradeBannerProps) {
  const tierName = PLAN_NAMES[requiredTier];

  const handleRequestUpgrade = () => {
    if (onRequestUpgrade) {
      onRequestUpgrade();
    } else {
      // Default: Open contact form or mailto
      window.location.href = 'mailto:sales@supplify.com?subject=Upgrade Request';
    }
  };

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-md w-full p-6">
          <div className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Sparkles className="h-6 w-6 text-blue-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Unlock {tierName} Features
            </h2>
            
            <p className="text-gray-600 mb-6">
              Upgrade to <span className="font-semibold">{tierName}</span> to access{' '}
              {feature}.
            </p>

            <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-2">{tierName} Includes:</h3>
              <ul className="text-sm text-gray-700 space-y-1">
                {requiredTier === 'PRO' && (
                  <>
                    <li>✓ Advanced analytics & reporting</li>
                    <li>✓ Sponsored campaigns & promotions</li>
                    <li>✓ Inventory management module</li>
                    <li>✓ 100 pinned products per supplier</li>
                    <li>✓ Up to 10 team members</li>
                  </>
                )}
                {requiredTier === 'PREMIUM' && (
                  <>
                    <li>✓ Everything in Pro</li>
                    <li>✓ API access & webhooks</li>
                    <li>✓ Advanced loyalty programs</li>
                    <li>✓ Priority support</li>
                    <li>✓ 100 team members</li>
                  </>
                )}
              </ul>
            </div>

            <button
              onClick={handleRequestUpgrade}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center"
            >
              Request Upgrade to {tierName}
              <ArrowRight className="ml-2 h-5 w-5" />
            </button>

            <p className="text-xs text-gray-500 mt-4">
              Contact your account admin to upgrade your plan
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              {tierName} Feature
            </h3>
            <p className="text-sm text-gray-700 mb-3">
              Upgrade to access {feature}
            </p>
            <button
              onClick={handleRequestUpgrade}
              className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors inline-flex items-center"
            >
              Request Upgrade
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default: banner variant
  return (
    <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border-l-4 border-amber-500 p-4 rounded-lg shadow-sm">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Upgrade to {tierName} Required
          </h3>
          <p className="text-sm text-gray-700 mb-3">
            Your current <span className="font-medium">{PLAN_NAMES[currentTier]}</span> plan doesn't include{' '}
            {feature}. Upgrade to <span className="font-medium">{tierName}</span> to unlock this feature.
          </p>
          <button
            onClick={handleRequestUpgrade}
            className="text-sm bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded-lg transition-colors inline-flex items-center"
          >
            Request Upgrade
            <ArrowRight className="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

