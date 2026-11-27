import { useEffect, useMemo, useState } from 'react'

/**
 * Merge offset pages of a server-searched list ("Load more"). Pages are kept per `resetKey`
 * (e.g. the search text), so a new search starts from its first page.
 */
export function useAccumulatedPages<T extends { id: string }>(
  items: T[] | undefined,
  offset: number,
  resetKey: string
) {
  const [state, setState] = useState<{ key: string; pages: Map<number, T[]> }>({
    key: resetKey,
    pages: new Map(),
  })

  useEffect(() => {
    if (!items) return
    setState((prev) => {
      const pages = prev.key === resetKey ? new Map(prev.pages) : new Map<number, T[]>()
      pages.set(offset, items)
      return { key: resetKey, pages }
    })
  }, [items, offset, resetKey])

  return useMemo(() => {
    if (state.key !== resetKey) return items ?? []
    const seen = new Set<string>()
    const merged: T[] = []
    for (const off of [...state.pages.keys()].sort((a, b) => a - b)) {
      for (const item of state.pages.get(off) ?? []) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        merged.push(item)
      }
    }
    return merged
  }, [items, resetKey, state])
}
