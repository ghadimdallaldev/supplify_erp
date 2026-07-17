import { describe, expect, it } from 'vitest'
import {
  FEATURE_KEY_LABELS,
  LIMIT_KEY_LABELS,
  RESTAURANT_FEATURE_KEYS,
  RESTAURANT_LIMIT_KEYS,
  SUPPLIER_FEATURE_KEYS,
  SUPPLIER_LIMIT_KEYS,
  getPlanSubtitle,
  formatPlanDisplayName,
} from './planComparison'

/** Backend canonical keys (keep FE comparison table within API). */
const API_RESTAURANT_FEATURES = [
  'chat',
  'order_calendar',
  'reports',
  'smart_reorder',
  'multi_branch',
  'receiving_quality',
  'disputes_returns',
  'finance_invoices',
  'quick_lists',
  'inventory_management',
  'waste_tracking',
  'advanced_roles',
  'notifications',
  'api_integrations',
  'support_sla',
  'custom_branding',
  'feature_flags_access',
  'supplier_reviews',
  'push_notifications',
  'order_amendments',
  'tenant_audit_log',
  'waitlist_auto_promo',
  'supplier_deals',
  'ai_platform',
] as const

const API_RESTAURANT_LIMITS = [
  'branches',
  'users',
  'orders_per_day',
  'suppliers_per_restaurant',
  'restaurant_inventory_skus',
  'chats_per_day',
  'open_conversations',
  'storage_mb',
  'quick_lists',
  'quick_list_items',
  'scheduled_quick_lists',
  'scheduled_order_grace_per_day',
  'deal_redemptions_per_day',
  'ai_requests_per_day',
] as const

describe('planComparison', () => {
  it('includes order_calendar feature label', () => {
    expect(FEATURE_KEY_LABELS.order_calendar).toBe('Order calendar')
    expect(RESTAURANT_FEATURE_KEYS).toContain('order_calendar')
  })

  it('returns plan blurbs that distinguish Growth vs Scale by name', () => {
    expect(getPlanSubtitle('free')).toBe('Time-limited trial')
    expect(getPlanSubtitle('silver')).toBe('For growing ops')
    expect(getPlanSubtitle('gold', 'Supplier Growth')).toBe('For growing ops')
    expect(getPlanSubtitle('platinum', 'Supplier Scale')).toBe('For multi-site volume')
    expect(getPlanSubtitle('gold', 'Restaurant Scale')).toBe('For multi-site volume')
  })

  it('formats free as a 30-day trial, not a permanent free plan', () => {
    expect(formatPlanDisplayName('free')).toBe('30-day Free Trial')
    expect(formatPlanDisplayName('free', 'Free')).toBe('30-day Free Trial')
  })

  it('surfaces active customer locations as the primary supplier scale meter', () => {
    expect(SUPPLIER_LIMIT_KEYS[0]).toBe('active_customer_locations_monthly')
    expect(LIMIT_KEY_LABELS.active_customer_locations_monthly).toBe('Active customer locations')
  })
  it('includes deals and promotions keys for plan comparison (GATE-R19, GATE-S13)', () => {
    expect(RESTAURANT_FEATURE_KEYS).toContain('supplier_deals')
    expect(LIMIT_KEY_LABELS.deal_redemptions_per_day).toBe('Deal redemptions per day')
    expect(LIMIT_KEY_LABELS.promotions).toBe('Active deals')
    expect(FEATURE_KEY_LABELS.supplier_deals).toBe('Supplier deals')
    expect(FEATURE_KEY_LABELS.promotions).toBe('Deals')
  })

  it('comparison feature/limit keys are subset of backend canonical keys', () => {
    for (const key of RESTAURANT_FEATURE_KEYS) {
      expect(API_RESTAURANT_FEATURES).toContain(key)
      expect(FEATURE_KEY_LABELS[key as keyof typeof FEATURE_KEY_LABELS]).toBeTruthy()
    }
    for (const key of SUPPLIER_FEATURE_KEYS) {
      expect(FEATURE_KEY_LABELS[key as keyof typeof FEATURE_KEY_LABELS]).toBeTruthy()
    }
    for (const key of RESTAURANT_LIMIT_KEYS) {
      expect(API_RESTAURANT_LIMITS).toContain(key)
      expect(LIMIT_KEY_LABELS[key as keyof typeof LIMIT_KEY_LABELS]).toBeTruthy()
    }
    for (const key of SUPPLIER_LIMIT_KEYS) {
      expect(LIMIT_KEY_LABELS[key as keyof typeof LIMIT_KEY_LABELS]).toBeTruthy()
    }
  })
})
