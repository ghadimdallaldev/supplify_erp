import { useEffect, useRef, useState } from 'react'
import { Clock, Search, X } from 'lucide-react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import {
  useGetSearchHistoryQuery,
  useUpsertSearchHistoryMutation,
  useDeleteSearchHistoryMutation,
  type SearchEntityType,
} from '../../services/api/endpoints/search'

type SearchHistoryDropdownProps = {
  entityType: SearchEntityType
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  'aria-label'?: string
  onDebouncedSearch?: (query: string) => void
}

export function SearchHistoryDropdown({
  entityType,
  value,
  onChange,
  placeholder = 'Search…',
  className,
  inputClassName,
  'aria-label': ariaLabel = 'Search',
  onDebouncedSearch,
}: SearchHistoryDropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data } = useGetSearchHistoryQuery({ entityType, limit: 8 })
  const [upsertHistory] = useUpsertSearchHistoryMutation()
  const [deleteHistory] = useDeleteSearchHistoryMutation()

  const history = data?.history ?? []

  useEffect(() => {
    if (!onDebouncedSearch) return
    const timer = window.setTimeout(() => onDebouncedSearch(value.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [value, onDebouncedSearch])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const persistSearch = (query: string) => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    upsertHistory({ entityType, query: trimmed }).catch(() => {})
  }

  const handleSelect = (query: string) => {
    onChange(query)
    setOpen(false)
    persistSearch(query)
  }

  const handleClearAll = async () => {
    try {
      await deleteHistory({ entityType }).unwrap()
    } catch {
      // non-blocking
    }
  }

  const handleRemove = async (query: string, event: React.MouseEvent) => {
    event.stopPropagation()
    try {
      await deleteHistory({ entityType, query }).unwrap()
    } catch {
      // non-blocking
    }
  }

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            persistSearch(value)
            setOpen(false)
          }
          if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        className={cn('h-10 pl-10', inputClassName)}
        aria-label={ariaLabel}
        aria-expanded={open && history.length > 0}
        aria-haspopup="listbox"
      />
      {open && history.length > 0 && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] shadow-lg"
          role="listbox"
          aria-label="Recent searches"
        >
          <div className="flex items-center justify-between border-b border-[var(--app-border)] px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              Recent searches
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleClearAll}
            >
              Clear all
            </Button>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {history.map((entry) => (
              <li key={entry.id}>
                <div className="flex w-full items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--bg)]">
                  <button
                    type="button"
                    role="option"
                    className="min-w-0 flex-1 truncate text-left text-sm"
                    onClick={() => handleSelect(entry.query)}
                  >
                    {entry.query}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                    aria-label={`Remove ${entry.query}`}
                    onClick={(e) => handleRemove(entry.query, e)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
