/**
 * Marketplace relationship error contract (API `RelationshipError` bodies):
 * `{ ok: false, error: { name, message, details } }`.
 */
export type RelationshipErrorName =
  | 'FOLLOW_REQUIRED'
  | 'SUPPLIER_BLOCKED'
  | 'SUPPLIER_FOLLOW_LIMIT_REACHED'
  | 'CHAT_READ_ONLY'
  | 'RESTAURANT_NOT_AVAILABLE'

type ApiErrorShape = {
  status?: number
  data?: { error?: { name?: string; message?: string; details?: unknown } }
}

export function apiErrorName(error: unknown): string | null {
  return (error as ApiErrorShape)?.data?.error?.name ?? null
}

export function apiErrorMessage(error: unknown): string | null {
  return (error as ApiErrorShape)?.data?.error?.message ?? null
}

export function isRelationshipError(error: unknown, name: RelationshipErrorName): boolean {
  return apiErrorName(error) === name
}

/** Suppliers listed by a FOLLOW_REQUIRED (403) response, e.g. at checkout. */
export function followRequiredSuppliers(
  error: unknown
): Array<{ id: string; name: string | null }> {
  if (!isRelationshipError(error, 'FOLLOW_REQUIRED')) return []
  const details = (error as ApiErrorShape).data?.error?.details as
    | { suppliers?: Array<{ id?: string; name?: string | null }> }
    | undefined
  return (details?.suppliers ?? [])
    .filter((s): s is { id: string; name?: string | null } => typeof s?.id === 'string')
    .map((s) => ({ id: s.id, name: s.name ?? null }))
}

/** Open order ids carried by a CHAT_READ_ONLY (403) response. */
export function chatReadOnlyOpenOrderIds(error: unknown): string[] {
  if (!isRelationshipError(error, 'CHAT_READ_ONLY')) return []
  const details = (error as ApiErrorShape).data?.error?.details as
    | { openOrderIds?: unknown[] }
    | undefined
  return (details?.openOrderIds ?? []).filter((id): id is string => typeof id === 'string')
}
