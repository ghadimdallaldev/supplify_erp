'use client';

import { Badge } from '@/components/ui/badge';
import { usePromoSuiteGate } from '@/hooks/usePromoSuiteFlag';

interface FeaturedBadgeProps {
  campaignId?: string;
  className?: string;
}

export function FeaturedBadge({ campaignId, className }: FeaturedBadgeProps) {
  const { Gate } = usePromoSuiteGate();

  return (
    <Gate fallback={null}>
      <Badge 
        variant="outline" 
        className={`text-xs font-semibold text-purple-600 border-purple-300 bg-purple-50 ${className}`}
      >
        Featured
      </Badge>
    </Gate>
  );
}
