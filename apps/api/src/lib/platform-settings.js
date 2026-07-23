import { query } from './db.js'

const DEFAULTS = {
  free_sandbox_days: 30,
}

/** Admin-configurable Free Trial length for new activations and extensions. */
export const FREE_TRIAL_MIN_DAYS = 7
export const FREE_TRIAL_MAX_DAYS = 90

export function clampFreeTrialDays(days, fallback = DEFAULTS.free_sandbox_days) {
  const n = Number(days)
  const base = Number.isFinite(n) ? Math.round(n) : fallback
  return Math.min(FREE_TRIAL_MAX_DAYS, Math.max(FREE_TRIAL_MIN_DAYS, base))
}

export async function getPlatformSetting(key, fallback = null) {
  try {
    const { rows } = await query(`SELECT value FROM platform_setting WHERE key = $1`, [key])
    if (!rows.length) {
      return fallback !== null ? fallback : (DEFAULTS[key] ?? null)
    }
    const raw = rows[0].value
    if (typeof raw === 'number') return raw
    if (typeof raw === 'string') {
      const n = Number(raw)
      return Number.isFinite(n) ? n : raw
    }
    return raw
  } catch (e) {
    if (e.code === '42P01') return fallback !== null ? fallback : (DEFAULTS[key] ?? null)
    throw e
  }
}

export async function setPlatformSetting(key, value) {
  await query(
    `INSERT INTO platform_setting (key, value, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  )
}

export async function getFreeSandboxDays() {
  const days = Number(await getPlatformSetting('free_sandbox_days', DEFAULTS.free_sandbox_days))
  if (!Number.isFinite(days)) return DEFAULTS.free_sandbox_days
  return clampFreeTrialDays(days, DEFAULTS.free_sandbox_days)
}

const DEFAULT_REFERRAL_PROGRAM_CONFIG = {
  firstPaidDiscountPercent: 20,
  supplierRewardType: 'free_month',
  referralValidityDays: 90,
  /** Caps keyed by supplier subscription_plan.code (four-plan: gold/platinum; legacy keys kept). */
  sponsorshipLimitsPerYear: {
    silver: 2,
    gold: 10,
    platinum: 25,
    enterprise: null,
  },
  eligibleSponsorPlans: ['silver', 'gold', 'platinum'],
  connectionRequestExpiryDays: 30,
  sponsorshipEnabled: true,
  offerExpiryDays: 14,
  /** Sponsored month is full price; discount applies to first restaurant-funded cycle. */
  referralDiscountAppliesTo: 'first_restaurant_funded',
  requireRestaurantPaymentMethodBeforeActivation: false,
  supplierPaymentAfterAcceptance: true,
  maxSponsoredAmount: null,
  supportedBillingIntervals: ['MONTHLY'],
  paymentPendingStaleDays: 7,
}

export async function getReferralProgramConfig() {
  const raw = await getPlatformSetting('referral_program_config', DEFAULT_REFERRAL_PROGRAM_CONFIG)
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_REFERRAL_PROGRAM_CONFIG }
  return { ...DEFAULT_REFERRAL_PROGRAM_CONFIG, ...raw }
}

export async function setReferralProgramConfig(config) {
  const merged = { ...DEFAULT_REFERRAL_PROGRAM_CONFIG, ...config }
  await setPlatformSetting('referral_program_config', merged)
  return merged
}
