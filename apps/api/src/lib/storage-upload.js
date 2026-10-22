import { getRequestTenant } from './rbac.js'
import {
  buildLimitExceededPayload,
  ensureStorageForUpload,
  getRecommendedPlanNames,
  getTenantSubscription,
} from './subscription.js'

/**
 * Reserve a conservative number of bytes when a client omits the optional
 * size. The upload session enforces the same ceiling, so callers cannot obtain
 * an unmetered max-size capability by sending zero or leaving fileSize out.
 */
export function resolveStorageReservationBytes(sizeBytes, maxBytes) {
  const parsedSize = Number(sizeBytes)
  const parsedMax = Number(maxBytes)
  if (!Number.isSafeInteger(parsedMax) || parsedMax <= 0) {
    throw new TypeError('maxBytes must be a positive safe integer')
  }
  return Number.isSafeInteger(parsedSize) && parsedSize > 0
    ? Math.min(parsedSize, parsedMax)
    : parsedMax
}

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
