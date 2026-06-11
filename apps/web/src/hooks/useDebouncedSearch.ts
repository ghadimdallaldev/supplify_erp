import { useEffect, useState } from 'react'

export function useDebouncedSearch(initial = '', delayMs = 300) {
  const [search, setSearch] = useState(initial)
  const [debouncedSearch, setDebouncedSearch] = useState(initial)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), delayMs)
    return () => window.clearTimeout(timer)
  }, [search, delayMs])

  return { search, setSearch, debouncedSearch }
}
