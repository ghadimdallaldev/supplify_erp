'use client';

import { Badge } from '@/components/ui/badge';
import { usePromoSuiteGate } from '@/hooks/usePromoSuiteFlag';

interface SponsoredBadgeProps {
  campaignId?: string;
  className?: string;
}

export function SponsoredBadge({ campaignId, className }: SponsoredBadgeProps) {
  const { Gate } = usePromoSuiteGate();

  return (
    <Gate fallback={null}>
      <Badge 
        variant="outline" 
        className={`text-xs font-semibold text-amber-600 border-amber-300 bg-amber-50 ${className}`}
      >
        Sponsored
      </Badge>
    </Gate>
  );
}
