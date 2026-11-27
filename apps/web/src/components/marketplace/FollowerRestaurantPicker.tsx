import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Search, X } from 'lucide-react'
import { useGetRestaurantsQuery } from '../../services/api'
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch'
import { cn } from '../../lib/utils'

export type PickedRestaurant = { id: string; name: string }

type Props = {
  value: string
  onChange: (id: string, restaurant: PickedRestaurant | null) => void
  /** Name of the selected restaurant when it is not in the current result page. */
  selectedName?: string | null
  placeholder?: string
  /** Label of the "no restaurant" option (e.g. "All restaurants" in a filter). */
  clearLabel?: string
  disabled?: boolean
  id?: string
  className?: string
}

const PAGE_SIZE = 20

/**
 * Supplier-side restaurant picker. Results come from a server search of the supplier's
 * followers (GET /api/restaurants is followers-only, spec §6.2 item 6), so it never loads or
 * filters a capped list of every customer in the browser.
 */
export function FollowerRestaurantPicker({
  value,
  onChange,
  selectedName,
  placeholder,
  clearLabel,
  disabled,
  id,
  className,
}: Props) {
  const { t } = useTranslation('common')
  const listId = useId()
  const [open, setOpen] = useState(false)
  const { search, setSearch, debouncedSearch } = useDebouncedSearch('', 250)
  const blurTimer = useRef<number | null>(null)

  const { data, isFetching } = useGetRestaurantsQuery(
    { q: debouncedSearch || undefined, limit: PAGE_SIZE, offset: 0 },
    { skip: disabled }
  )
  const restaurants = useMemo(
    () => (data?.restaurants ?? []).map((r) => ({ id: r.id, name: r.name })),
    [data?.restaurants]
  )
  const selected =
    restaurants.find((r) => r.id === value)?.name ?? (value ? (selectedName ?? '') : '')

  const choose = (restaurant: PickedRestaurant | null) => {
    onChange(restaurant?.id ?? '', restaurant)
    setSearch('')
    setOpen(false)
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          className="h-10 w-full rounded-md border border-[var(--app-border-mid)] bg-[var(--surface)] ps-8 pe-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          placeholder={selected || placeholder || t('marketplace.searchFollowers')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = window.setTimeout(() => setOpen(false), 150)
          }}
        />
        {isFetching ? (
          <Loader2 className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
        ) : value ? (
          <button
            type="button"
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
            aria-label={clearLabel || t('actions.clear', { defaultValue: 'Clear' })}
            onClick={() => choose(null)}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--app-border)] bg-[var(--surface)] py-1 shadow-lg"
          onMouseDown={() => {
            if (blurTimer.current) window.clearTimeout(blurTimer.current)
          }}
        >
          {clearLabel ? (
            <li
              role="option"
              aria-selected={!value}
              className="cursor-pointer px-3 py-2 text-sm text-[var(--text-mid)] hover:bg-[var(--brand-ultra)]"
              onClick={() => choose(null)}
            >
              {clearLabel}
            </li>
          ) : null}
          {restaurants.map((restaurant) => (
            <li
              key={restaurant.id}
              role="option"
              aria-selected={restaurant.id === value}
              className={cn(
                'cursor-pointer px-3 py-2 text-sm hover:bg-[var(--brand-ultra)]',
                restaurant.id === value && 'font-medium text-[var(--brand-mid)]'
              )}
              onClick={() => choose(restaurant)}
            >
              {restaurant.name}
            </li>
          ))}
          {restaurants.length === 0 && !isFetching ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
              {debouncedSearch
                ? t('marketplace.noFollowersMatch')
                : t('marketplace.noFollowersYet')}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
