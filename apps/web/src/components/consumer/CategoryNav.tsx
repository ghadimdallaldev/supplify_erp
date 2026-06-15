import { useEffect, useRef } from 'react'
import { cn } from '../../lib/utils'

type CategoryNavProps = {
  categories: Array<{ id: string; name: string }>
  activeCategoryId?: string
  onSelect: (categoryId: string) => void
  className?: string
  sticky?: boolean
  ariaLabel?: string
}

export function CategoryNav({
  categories,
  activeCategoryId,
  onSelect,
  className,
  sticky = true,
  ariaLabel = 'Menu categories',
}: CategoryNavProps) {
  const navRef = useRef<HTMLDivElement>(null)
  const activeId = activeCategoryId ?? categories[0]?.id

  useEffect(() => {
    if (!activeId || !navRef.current) return
    const pill = navRef.current.querySelector<HTMLElement>(`[data-category-id="${activeId}"]`)
    pill?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeId])

  if (!categories.length) return null

  return (
    <div
      ref={navRef}
      className={cn(
        sticky &&
          'sticky top-[73px] z-30 bg-[var(--surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80',
        '-mx-4 border-b border-[var(--app-border)] px-4 py-2.5',
        className
      )}
    >
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none"
        role="tablist"
        aria-label={ariaLabel}
      >
        {categories.map((category) => {
          const active = category.id === activeId
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              data-category-id={category.id}
              aria-selected={active}
              onClick={() => onSelect(category.id)}
              className={cn(
                'consumer-category-pill shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium',
                active
                  ? 'bg-[var(--brand-mid)] text-white'
                  : 'text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
              )}
            >
              {category.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CategoryNav
