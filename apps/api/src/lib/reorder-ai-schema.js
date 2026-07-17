import { z } from 'zod'

export const REORDER_AI_ACTIONS = ['order', 'wait', 'manual_review']
export const REORDER_AI_PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
export const REORDER_AI_DATA_QUALITY = ['good', 'fair', 'poor']
export const REORDER_AI_SOURCES = ['ai', 'forecast', 'rule_based']

const alternativeSchema = z.object({
  recommendedQuantity: z.number().nonnegative().optional(),
  supplierId: z.string().optional().nullable(),
  rationale: z.string().optional(),
})

/** Single product decision from the LLM batch recommend call. */
export const reorderAiDecisionItemSchema = z.object({
  productId: z.string().min(1),
  action: z.enum(REORDER_AI_ACTIONS),
  recommendedQuantity: z.number().nonnegative().nullable().optional(),
  supplierId: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  priority: z.enum(REORDER_AI_PRIORITIES).optional(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1),
  reasoning: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  alternatives: z.array(alternativeSchema).default([]),
  dataQuality: z.enum(REORDER_AI_DATA_QUALITY).optional(),
})

/** Batch envelope — accept either `{ recommendations: [...] }` or a bare array. */
export const reorderAiDecisionBatchSchema = z.union([
  z.object({
    recommendations: z.array(reorderAiDecisionItemSchema).min(1).max(15),
  }),
  z.array(reorderAiDecisionItemSchema).min(1).max(15),
])

/**
 * Normalize LLM batch output into a recommendations array.
 * @param {unknown} data
 * @returns {{ success: true, recommendations: z.infer<typeof reorderAiDecisionItemSchema>[] } | { success: false, error: z.ZodError }}
 */
export function parseReorderAiDecisionBatch(data) {
  const parsed = reorderAiDecisionBatchSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error }
  }
  const recommendations = Array.isArray(parsed.data) ? parsed.data : parsed.data.recommendations
  return { success: true, recommendations }
}
