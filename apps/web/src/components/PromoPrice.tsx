'use client';

import { usePromoSuiteGate } from '../../hooks/usePromoSuiteFlag';

interface PromoPriceProps {
  originalPrice: number;
  discountType: 'PERCENT' | 'AMOUNT';
  discountValue: number;
  className?: string;
}

export function PromoPrice({ originalPrice, discountType, discountValue, className }: PromoPriceProps) {
  const { Gate } = usePromoSuiteGate();

  const calculatePromoPrice = () => {
    if (discountType === 'PERCENT') {
      return originalPrice * (1 - discountValue / 100);
    } else {
      return Math.max(0, originalPrice - discountValue);
    }
  };

  const promoPrice = calculatePromoPrice();
  const savingsPercent = ((originalPrice - promoPrice) / originalPrice) * 100;

  return (
    <Gate fallback={
      <span className={className}>
        ${originalPrice.toFixed(2)}
      </span>
    }>
      <div className={className}>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-green-600">
            ${promoPrice.toFixed(2)}
          </span>
          <span className="text-sm text-gray-500 line-through">
            ${originalPrice.toFixed(2)}
          </span>
          <span className="text-xs text-green-600 font-medium">
            Save {savingsPercent.toFixed(0)}%
          </span>
        </div>
      </div>
    </Gate>
  );
}
