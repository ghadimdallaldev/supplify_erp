/** Lowercase UUID for reliable Map lookups between reservation and floor table ids. */
export function normalizeTableId(id: string): string {
  return String(id).trim().toLowerCase()
}

/**
 * Normalizes reservation.tables from API (uuid[], Postgres "{uuid}" string, or null).
 */
export function reservationTableIds(reservation: { tables?: unknown }): string[] {
  const raw = reservation.tables
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (item == null || item === '') return []
      const asString = String(item).trim()
      if (asString.startsWith('{')) {
        return reservationTableIds({ tables: asString })
      }
      return [normalizeTableId(asString)]
    })
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s || s === '{}') return []
    if (s.startsWith('{')) {
      return s
        .slice(1, -1)
        .split(',')
        .map((part) => normalizeTableId(part.replace(/^"|"$/g, '')))
        .filter(Boolean)
    }
    return [normalizeTableId(s)]
  }
  return []
}

export function lookupTableAssignment<T>(
  map: Map<string, T>,
  tableId: string | undefined | null
): T | undefined {
  if (!tableId) return undefined
  return map.get(normalizeTableId(tableId))
}

export type TableAssignmentInfo = {
  status: string
  customerName: string
  partySize: number
  reservationId: string
}

/** Resolve today's assignment for a floor table directly from board reservations. */
export function findReservationForTable(
  table: { id?: string | null; localId?: string | null },
  reservations: Array<{
    id: string
    status: string
    customer_name: string
    party_size: number
    tables?: unknown
  }>
): TableAssignmentInfo | undefined {
  const candidates = new Set<string>()
  if (table.id) candidates.add(normalizeTableId(table.id))
  if (table.localId) candidates.add(normalizeTableId(table.localId))

  if (!candidates.size) return undefined

  for (const res of reservations) {
    if (res.status === 'CANCELLED' || res.status === 'COMPLETED') continue
    const ids = reservationTableIds(res)
    if (ids.some((id) => candidates.has(id))) {
      return {
        status: res.status,
        customerName: res.customer_name,
        partySize: res.party_size,
        reservationId: res.id,
      }
    }
  }
  return undefined
}
