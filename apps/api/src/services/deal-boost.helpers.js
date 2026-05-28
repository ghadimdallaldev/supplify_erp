/**
 * Boost package / campaign helpers (pricing UX — no payment flow changes).
 */

export function buildBoostStatus(activePromo, pricingRow = null) {
  if (!activePromo) {
    return { state: 'none' }
  }

  const now = Date.now()
  const startsAt = activePromo.starts_at ? new Date(activePromo.starts_at).getTime() : now
  const endsAt = activePromo.ends_at ? new Date(activePromo.ends_at).getTime() : null

  if (endsAt != null && endsAt <= now) {
    return {
      state: 'expired',
      packageName: activePromo.package_display_name || pricingRow?.display_name || 'Boost',
      pricingKey: activePromo.pricing_key || pricingRow?.pricing_key || null,
      endsAt: activePromo.ends_at,
      pricePaid: activePromo.price_paid ?? activePromo.budget,
    }
  }

  if (startsAt > now) {
    const daysRemaining = endsAt != null ? Math.max(0, Math.ceil((endsAt - now) / 86400000)) : null
    return {
      state: 'scheduled',
      packageName: activePromo.package_display_name || pricingRow?.display_name || 'Boost',
      pricingKey: activePromo.pricing_key || pricingRow?.pricing_key || null,
      startsAt: activePromo.starts_at,
      endsAt: activePromo.ends_at,
      daysRemaining,
      pricePaid: activePromo.price_paid ?? activePromo.budget,
    }
  }

  const daysRemaining = endsAt != null ? Math.max(0, Math.ceil((endsAt - now) / 86400000)) : null

  return {
    state: 'active',
    packageName: activePromo.package_display_name || pricingRow?.display_name || 'Boost',
    pricingKey: activePromo.pricing_key || pricingRow?.pricing_key || null,
    startsAt: activePromo.starts_at,
    endsAt: activePromo.ends_at,
    daysRemaining,
    pricePaid: activePromo.price_paid ?? activePromo.budget,
    durationDays: activePromo.duration_days ?? pricingRow?.duration_days ?? null,
  }
}

export function isBoostPricingRow(row) {
  if (!row) return false
  if (row.package_type === 'boost') return true
  const key = String(row.pricing_key || '')
  return key.startsWith('boost_')
}
