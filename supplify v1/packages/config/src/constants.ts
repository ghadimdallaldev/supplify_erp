export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const CURRENCIES = ['USD', 'EUR', 'AED'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'USD';

export const UNITS = ['kg', 'g', 'l', 'ml', 'piece', 'box', 'pack'] as const;
export type Unit = (typeof UNITS)[number];

export const LOYALTY_TIERS = {
  BRONZE: { minPoints: 0, multiplier: 1.0, name: 'Bronze' },
  SILVER: { minPoints: 1000, multiplier: 1.2, name: 'Silver' },
  GOLD: { minPoints: 5000, multiplier: 1.5, name: 'Gold' },
} as const;

export const ORDER_STATUSES = [
  'PLACED',
  'ACKNOWLEDGED', 
  'PREPARING',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const USER_ROLES = ['RESTAURANT', 'SUPPLIER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// SLA Configuration (in minutes)
export const SLA_CONFIG = {
  ACKNOWLEDGEMENT_TIMEOUT: 30, // 30 minutes to acknowledge
  PREPARATION_TIMEOUT: 120,    // 2 hours to start preparing
  DISPATCH_TIMEOUT: 240,       // 4 hours to dispatch
} as const;

// Order Event Types
export const ORDER_EVENT_TYPES = [
  'PLACED',
  'ACKNOWLEDGED',
  'PREPARING', 
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
  'ETA_UPDATED',
  'NOTE_ADDED',
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

// Actor Types
export const ACTOR_TYPES = [
  'SYSTEM',
  'SUPPLIER', 
  'RESTAURANT',
  'ADMIN',
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

