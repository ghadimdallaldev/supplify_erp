'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { usePromoSuiteGate } from './usePromoSuiteFlag';

interface UsePromoSuiteTrackingProps {
  campaignId: string;
  enabled?: boolean;
}

export function usePromoSuiteTracking({ campaignId, enabled = true }: UsePromoSuiteTrackingProps) {
  const { isEnabled } = usePromoSuiteGate();
  const viewIdRef = useRef<string | null>(null);
  const hasLoggedImpression = useRef(false);

  // Generate unique view ID
  useEffect(() => {
    if (isEnabled && enabled && !viewIdRef.current) {
      viewIdRef.current = `view_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }, [isEnabled, enabled]);

  const logImpressionMutation = useMutation({
    mutationFn: async ({ campaignId, viewId }: { campaignId: string; viewId: string }) => {
      const response = await fetch('/api/promosuite/tracking/impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId, viewId }),
      });
      if (!response.ok) throw new Error('Failed to log impression');
      return response.json();
    },
  });

  const logClickMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await fetch('/api/promosuite/tracking/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      });
      if (!response.ok) throw new Error('Failed to log click');
      return response.json();
    },
  });

  const logImpression = useCallback(() => {
    if (!isEnabled || !enabled || !viewIdRef.current || hasLoggedImpression.current) {
      return;
    }

    hasLoggedImpression.current = true;
    logImpressionMutation.mutate({
      campaignId,
      viewId: viewIdRef.current,
    });
  }, [isEnabled, enabled, campaignId]);

  const logClick = useCallback(() => {
    if (!isEnabled || !enabled) {
      return;
    }

    logClickMutation.mutate(campaignId);
  }, [isEnabled, enabled, campaignId]);

  return {
    logImpression,
    logClick,
    isTrackingEnabled: isEnabled && enabled,
  };
}

// Hook for intersection observer to track impressions
export function usePromoSuiteImpressionTracking(campaignId: string, enabled = true) {
  const { logImpression } = usePromoSuiteTracking({ campaignId, enabled });
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            logImpression();
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(elementRef.current);

    return () => {
      observer.disconnect();
    };
  }, [logImpression, enabled]);

  return elementRef;
}
