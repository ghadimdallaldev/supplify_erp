import { getRequestTenant } from './rbac.js'
import {
  buildLimitExceededPayload,
  ensureStorageForUpload,
  getRecommendedPlanNames,
  getTenantSubscription,
} from './subscription.js'

/**
 * Resolve tenant from request and meter file bytes against storage_mb.
 * @param {import('express').Request} req
 * @param {number} sizeBytes
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: object }>}
 */
export async function meterStorageFromRequest(req, sizeBytes) {
  if (!sizeBytes || sizeBytes <= 0 || req.userData?.role === 'ADMIN') {
    return { ok: true }
  }

  const tenant = await getRequestTenant(req)
  if (!tenant) {
    return { ok: true }
  }

  const result = await ensureStorageForUpload(tenant.tenantId, tenant.tenantType, sizeBytes)
  if (result.allowed) {
    return { ok: true }
  }

  const [subscription, recommendedPlans] = await Promise.all([
    getTenantSubscription(tenant.tenantId, tenant.tenantType),
    getRecommendedPlanNames(tenant.tenantType),
  ])

  const limitCheck = {
    current: result.current,
    limit: result.limit,
  }
  const err = buildLimitExceededPayload(
    limitCheck,
    'storage_mb',
    subscription?.plan_name || subscription?.plan_display_name,
    recommendedPlans,
    undefined,
    tenant.tenantType
  )

  return {
    ok: false,
    status: 403,
    error: {
      ...err,
      message: `Upload would exceed your storage limit (${result.current}/${result.limit} MB used). Upgrade your plan for more storage.`,
    },
  }
}
