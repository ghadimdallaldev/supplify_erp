type PricingRow = Record<string, unknown>

/** Unwrap `{ ok, data: { pricing } }` or already-unwrapped `{ pricing }`. */
export function normalizeContractPricingList(response: unknown): { pricing: PricingRow[] } {
  if (response && typeof response === 'object') {
    const direct = response as { pricing?: unknown; data?: { pricing?: unknown } }
    if (Array.isArray(direct.pricing)) {
      return { pricing: direct.pricing as PricingRow[] }
    }
    if (Array.isArray(direct.data?.pricing)) {
      return { pricing: direct.data.pricing as PricingRow[] }
    }
  }
  return { pricing: [] }
}

export function normalizeMyContractPricing(response: unknown): {
  pricing: PricingRow[]
  summary: PricingRow[]
} {
  if (response && typeof response === 'object') {
    const direct = response as {
      pricing?: unknown
      summary?: unknown
      data?: { pricing?: unknown; summary?: unknown }
    }
    if (Array.isArray(direct.pricing) || Array.isArray(direct.summary)) {
      return {
        pricing: Array.isArray(direct.pricing) ? (direct.pricing as PricingRow[]) : [],
        summary: Array.isArray(direct.summary) ? (direct.summary as PricingRow[]) : [],
      }
    }
    if (direct.data && typeof direct.data === 'object') {
      return {
        pricing: Array.isArray(direct.data.pricing) ? (direct.data.pricing as PricingRow[]) : [],
        summary: Array.isArray(direct.data.summary) ? (direct.data.summary as PricingRow[]) : [],
      }
    }
  }
  return { pricing: [], summary: [] }
}

export function normalizeResolvedContractPrices(response: unknown): {
  items: Array<{
    productId: string
    supplierId: string
    quantity: number
    unitPrice: number
    source: string
    defaultPrice: number | null
    contractPriceId: string | null
  }>
} {
  type ResolvedItem = {
    productId: string
    supplierId: string
    quantity: number
    unitPrice: number
    source: string
    defaultPrice: number | null
    contractPriceId: string | null
  }

  if (response && typeof response === 'object') {
    const direct = response as { items?: unknown; data?: { items?: unknown } }
    const raw = Array.isArray(direct.items)
      ? direct.items
      : Array.isArray(direct.data?.items)
        ? direct.data.items
        : null
    if (raw) {
      return { items: raw as ResolvedItem[] }
    }
  }
  return { items: [] }
}

export function normalizeContractPricingRecord(response: unknown): {
  pricing: PricingRow
} {
  if (response && typeof response === 'object') {
    const direct = response as { pricing?: unknown; data?: { pricing?: unknown } }
    if (direct.pricing && typeof direct.pricing === 'object' && !Array.isArray(direct.pricing)) {
      return { pricing: direct.pricing as PricingRow }
    }
    if (
      direct.data?.pricing &&
      typeof direct.data.pricing === 'object' &&
      !Array.isArray(direct.data.pricing)
    ) {
      return { pricing: direct.data.pricing as PricingRow }
    }
  }
  return { pricing: {} }
}
