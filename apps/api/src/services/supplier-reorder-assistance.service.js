import {
  getReorderIntelligence,
  createReorderReminderDraft,
} from './supplier-reorder-intelligence.service.js'
import { listSupplierAtRisk } from './reorder-cadence.service.js'
import { getOrCreateConversation } from '../lib/chat-conversation.js'
import { isFeatureEnabled } from '../lib/subscription.js'

const CHURN_MULTIPLIER = 1.5

function mergeSuggestions(intelligenceCustomers, cadenceAtRisk) {
  const byRestaurant = new Map()

  for (const c of intelligenceCustomers) {
    const gapRatio = c.avgDaysBetween ? c.daysSinceLastOrder / c.avgDaysBetween : 1
    const isChurnRisk = gapRatio >= CHURN_MULTIPLIER
    byRestaurant.set(c.restaurantId, {
      id: `intel-${c.restaurantId}`,
      restaurantId: c.restaurantId,
      restaurantName: c.restaurantName,
      reasonCode: isChurnRisk ? 'churn_risk' : 'missed_pattern',
      reasonLabel: isChurnRisk
        ? 'May be at risk of churn'
        : `Usually orders every ~${c.avgDaysBetween} days`,
      detail: c.suggestedFollowUp,
      daysSinceLastOrder: c.daysSinceLastOrder,
      avgDaysBetween: c.avgDaysBetween,
      lastOrderAt: c.lastOrderAt,
      suggestedProducts: c.suggestedProducts,
      riskLevel: isChurnRisk ? 'high' : c.riskLevel,
      urgency: isChurnRisk ? 'HIGH' : c.riskLevel === 'high' ? 'HIGH' : 'MEDIUM',
      sources: ['intelligence'],
    })
  }

  for (const row of cadenceAtRisk) {
    const existing = byRestaurant.get(row.restaurantId)
    const cadenceEntry = {
      reasonCode: 'cadence_missed',
      reasonLabel: `Usually orders ${row.label} every ${row.dayName}`,
      cadenceId: row.cadenceId,
      detail: `${row.restaurantName} usually orders on ${row.dayName}s but has not ordered yet.`,
    }
    if (existing) {
      existing.sources.push('cadence')
      if (!existing.cadenceId) {
        existing.cadenceId = row.cadenceId
        existing.reasonLabel = cadenceEntry.reasonLabel
      }
    } else {
      byRestaurant.set(row.restaurantId, {
        id: `cadence-${row.restaurantId}-${row.cadenceId}`,
        restaurantId: row.restaurantId,
        restaurantName: row.restaurantName,
        reasonCode: 'cadence_missed',
        reasonLabel: cadenceEntry.reasonLabel,
        detail: cadenceEntry.detail,
        cadenceId: row.cadenceId,
        suggestedProducts: [],
        riskLevel: 'medium',
        urgency: 'MEDIUM',
        sources: ['cadence'],
      })
    }
  }

  return [...byRestaurant.values()].sort((a, b) => {
    const rank = { HIGH: 2, MEDIUM: 1, LOW: 0 }
    return (rank[b.urgency] || 0) - (rank[a.urgency] || 0)
  })
}

/**
 * Unified supplier customer follow-up suggestions.
 */
export async function getSupplierReorderAssistance(supplierId, { graceDays } = {}) {
  const [intelligence, cadenceAtRisk] = await Promise.all([
    getReorderIntelligence(supplierId, { graceDays }),
    listSupplierAtRisk(supplierId),
  ])

  const suggestions = mergeSuggestions(intelligence.customersAtRisk, cadenceAtRisk)

  return {
    suggestions,
    total: suggestions.length,
    graceDays: intelligence.graceDays,
  }
}

/**
 * Create reminder draft; optionally prepare chat conversation for prefilled message.
 */
export async function createSupplierFollowUpDraft(
  supplierId,
  restaurantId,
  createdBy,
  { openChat = false } = {}
) {
  const draft = await createReorderReminderDraft(supplierId, restaurantId, createdBy)
  if (!draft) return null

  let chatConversationId = null
  let chatPrefill = draft.body

  if (openChat) {
    const chatEnabled = await isFeatureEnabled(supplierId, 'SUPPLIER', 'chat')
    if (chatEnabled) {
      const conversation = await getOrCreateConversation(supplierId, restaurantId, {
        enforceOpenLimit: false,
      })
      chatConversationId = conversation.id
    }
  }

  return {
    ...draft,
    chatConversationId,
    chatPrefill,
    chatUrl: chatConversationId ? `/app/chat?conversation=${chatConversationId}` : null,
  }
}
