/**
 * Parse limit/offset for admin tenant list endpoints.
 * @param {Record<string, unknown>} query
 */
export function parseAdminListPagination(query = {}) {
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? 50), 10) || 50, 1), 100)
  const offset = Math.max(parseInt(String(query.offset ?? 0), 10) || 0, 0)
  return { limit, offset }
}
