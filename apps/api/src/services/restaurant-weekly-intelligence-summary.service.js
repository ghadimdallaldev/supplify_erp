/**
 * Read-only weekly review of already-computed restaurant intelligence.
 *
 * This is deliberately an aggregation layer. It never recalculates a source
 * metric, assigns a composite score, or turns a review signal into an action.
 */
import { getWasteIntelligence } from './restaurant-waste-intelligence.service.js'
import { listSupplierReliability } from './restaurant-supplier-reliability.service.js'
import { listOverOrderingIntelligence } from './restaurant-over-ordering-intelligence.service.js'
import { listInvoiceAnomalies } from './restaurant-invoice-anomaly-intelligence.service.js'
import { getCachedForecasts } from './reorder-forecast-cache.service.js'

const DEFAULT_PERIOD_DAYS = 7
const MAX_PERIOD_DAYS = 31
const MAX_HIGHLIGHTS = 3
const STOCKOUT_URGENCIES = new Set(['URGENT', 'HIGH'])

function clampPeriodDays(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_PERIOD_DAYS
  return Math.min(MAX_PERIOD_DAYS, Math.max(DEFAULT_PERIOD_DAYS, parsed))
}

function bounded(items) {
  return (items || []).slice(0, MAX_HIGHLIGHTS)
}

/**
 * @param {string} restaurantId
 * @param {{ days?: number, now?: Date }} [opts]
 * @param {object} [sources]
 */
export async function getWeeklyIntelligenceSummary(
  restaurantId,
  opts = {},
  sources = {
    getWasteIntelligence,
    listSupplierReliability,
    listOverOrderingIntelligence,
    listInvoiceAnomalies,
    getCachedForecasts,
  }
) {
  if (!restaurantId) throw new Error('restaurantId is required')

  const periodDays = clampPeriodDays(opts.days)
  // Some signals must use enough recorded evidence to remain meaningful. They
  // are labelled explicitly rather than being presented as seven-day facts.
  const supplierWindowDays = Math.max(28, periodDays)
  const overOrderingWindowDays = Math.max(90, periodDays)

  const [waste, supplierReliability, overOrdering, invoiceAnomalies, forecasts] = await Promise.all(
    [
      sources.getWasteIntelligence(restaurantId, { days: periodDays, limit: MAX_HIGHLIGHTS }),
      sources.listSupplierReliability(restaurantId, { days: supplierWindowDays }),
      sources.listOverOrderingIntelligence(restaurantId, {
        days: overOrderingWindowDays,
        limit: MAX_HIGHLIGHTS,
      }),
      sources.listInvoiceAnomalies(restaurantId, { days: periodDays, limit: MAX_HIGHLIGHTS }),
      sources.getCachedForecasts(restaurantId),
    ]
  )

  const supplierExceptions = (supplierReliability.suppliers || []).filter(
    (supplier) => supplier.signals?.length > 0
  )
  const stockoutRisks = (forecasts || []).filter((forecast) =>
    STOCKOUT_URGENCIES.has(forecast.urgency)
  )

  return {
    periodDays,
    generatedAt: (opts.now instanceof Date ? opts.now : new Date()).toISOString(),
    evidenceWindows: {
      wasteDays: waste.windowDays,
      supplierReliabilityDays: supplierReliability.windowDays,
      overOrderingDays: overOrdering.windowDays,
      invoiceAnomaliesDays: invoiceAnomalies.windowDays,
      stockoutForecasts: 'current_non_stale',
    },
    summary: {
      wasteHotspots: waste.hotspots?.length || 0,
      supplierExceptions: supplierExceptions.length,
      overOrderedProducts: overOrdering.summary?.flaggedProducts || 0,
      invoicesWithAnomalies: invoiceAnomalies.summary?.invoicesWithAnomalies || 0,
      stockoutRisks: stockoutRisks.length,
    },
    sections: {
      waste: { summary: waste.summary, hotspots: bounded(waste.hotspots) },
      supplierReliability: { suppliers: bounded(supplierExceptions) },
      overOrdering: { products: bounded(overOrdering.products) },
      invoiceAnomalies: {
        duplicateLinkedInvoiceProtection: invoiceAnomalies.duplicateLinkedInvoiceProtection,
        invoices: bounded(invoiceAnomalies.invoices),
      },
      stockout: { forecasts: bounded(stockoutRisks) },
    },
  }
}
