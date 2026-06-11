import { z } from 'zod'
import { requireFeature } from '../../lib/subscription.js'
import {
  getSupplierRatingSummariesBatch,
  getRecentReviewsForSuppliersBatch,
} from '../../services/reviews.service.js'

export const multiWarehouseFeature = requireFeature(
  'multi_warehouse',
  (req) => req.tenantContext?.tenantId,
  (req) => req.tenantContext?.tenantType || 'SUPPLIER'
)

export const brandingUpdateSchema = z.object({
  brandPrimary: z.string().optional().nullable(),
  brandAccent: z.string().optional().nullable(),
  brandDisplayName: z.string().max(120).optional().nullable(),
})

export async function attachReviewFields(suppliers) {
  if (!suppliers.length) return suppliers
  const ids = suppliers.map((s) => s.id)
  const [summaries, reviewsBySupplier] = await Promise.all([
    getSupplierRatingSummariesBatch(ids),
    getRecentReviewsForSuppliersBatch(ids, 3),
  ])
  return suppliers.map((s) => {
    const summary = summaries.get(s.id) || {
      avg_overall: 0,
      review_count: 0,
    }
    return {
      ...s,
      avg_overall: Number(summary.avg_overall) || 0,
      review_count: summary.review_count ?? 0,
      recent_reviews: reviewsBySupplier.get(s.id) || [],
    }
  })
}

export const supplierCreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  vatNo: z.string().max(50).optional(),
  contactEmail: z.string().email(),
  phone: z.string().max(20).optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
})

export const supplierUpdateSchema = supplierCreateSchema.partial().extend({
  publicCatalogEnabled: z.boolean().optional(),
})

export const supplierListSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('20'),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .default('0'),
})
