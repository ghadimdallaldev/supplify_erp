'use client';

import { Badge } from '../../components/ui/badge';
import { usePromoSuiteGate } from '../../hooks/usePromoSuiteFlag';

interface DiscountBadgeProps {
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  className?: string;
}

export function DiscountBadge({ discountType, discountValue, className }: DiscountBadgeProps) {
  const { Gate } = usePromoSuiteGate();

  const getDiscountText = () => {
    if (discountType === 'PERCENT') {
      return `-${discountValue}%`;
    } else {
      return `Save $${discountValue.toFixed(2)}`;
    }
  };

  return (
    <Gate fallback={null}>
      <Badge 
        variant="outline" 
        className={`text-xs font-semibold text-green-600 border-green-300 bg-green-50 ${className}`}
      >
        {getDiscountText()}
      </Badge>
    </Gate>
  );
}
