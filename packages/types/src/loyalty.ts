export interface PointsLedger {
  id: string;
  entityId: string;
  entityType: 'RESTAURANT' | 'SUPPLIER';
  delta: number;
  reason: string;
  orderId?: string;
  createdAt: Date;
}

export interface LoyaltyBalance {
  entityId: string;
  totalPoints: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  multiplier: number;
}

export interface TierRules {
  tier: 'BRONZE' | 'SILVER' | 'GOLD';
  minPoints: number;
  multiplier: number;
  perks: Record<string, unknown>;
}

