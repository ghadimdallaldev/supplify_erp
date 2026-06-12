import { useEffect, useState } from 'react'

/**
 * Safe matchMedia hook — no-ops when matchMedia is unavailable (SSR, jsdom).
 */
export function useMediaQuery(query: string, defaultValue = false) {
  const [matches, setMatches] = useState(defaultValue)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let mql: MediaQueryList | null = null

    try {
      if (typeof window.matchMedia !== 'function') {
        setMatches(defaultValue)
        return
      }
      mql = window.matchMedia(query)
    } catch {
      setMatches(defaultValue)
      return
    }

    const sync = () => setMatches(mql?.matches ?? defaultValue)
    sync()

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', sync)
      return () => mql?.removeEventListener('change', sync)
    }

    mql.addListener(sync)
    return () => mql?.removeListener(sync)
  }, [query, defaultValue])

  return matches
}
