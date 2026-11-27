import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { useGetProductCategoriesQuery, useSearchQuery } from '../../services/api'
import { Skeleton } from '../ui/skeleton'
import { cn } from '../../lib/utils'
import { localizedName } from '../../lib/categoryLabel'
import { getLanguageDirection } from '../../i18n/config'
import type { CategoryDepartment, CategoryNode } from '../../types'
import type { SearchCategoryHit } from '../../services/api/endpoints/search'
import { categoryIcon, categoryTint } from './categoryIcons'

export const categoryPath = (slug: string) => `/app/shop/category/${slug}`

export function CategoryIconBadge({
  iconKey,
  tintKey,
  size = 'md',
}: {
  iconKey?: string | null
  /** Drives the tint; defaults to the icon key (departments pass their own). */
  tintKey?: string | null
  size?: 'sm' | 'md'
}) {
  const Icon = categoryIcon(iconKey)
  return (
    <span
      data-icon-key={iconKey ?? ''}
      aria-hidden="true"
      className={cn(
        // Squircle: generous radius relative to the box, not a circle.
        'inline-flex shrink-0 items-center justify-center',
        size === 'md' ? 'h-11 w-11 rounded-[14px]' : 'h-7 w-7 rounded-[9px]',
        categoryTint(tintKey ?? iconKey)
      )}
    >
      <Icon weight="duotone" className={size === 'md' ? 'h-6 w-6' : 'h-4 w-4'} />
    </span>
  )
}

type CategoryBrowseProps = {
  /** Highlight this leaf or department in the rail. */
  activeSlug?: string
  /** Only show this department's categories in the rail (category pages). */
  departmentId?: string
  /** Hide the department tiles (category pages show the rail only). */
  railOnly?: boolean
  className?: string
}

/**
 * Restaurant category browsing: department tiles with tinted icons and counts, plus a rail of
 * the categories that have visible products. Counts and emptiness come from the API (restaurants
 * see only categories with products from suppliers they can see).
 */
export function CategoryBrowse({
  activeSlug,
  departmentId,
  railOnly = false,
  className,
}: CategoryBrowseProps) {
  const { t, i18n } = useTranslation('products')
  const { data, isLoading } = useGetProductCategoriesQuery()
  const departments = useMemo(
    () => (data?.departments ?? []) as CategoryDepartment[],
    [data?.departments]
  )
  const dir = getLanguageDirection(i18n.language)

  const railCategories = useMemo(() => {
    const source = departmentId ? departments.filter((d) => d.id === departmentId) : departments
    return source
      .flatMap((d) => d.categories)
      .filter((c) => c.product_count > 0)
      .sort((a, b) => b.product_count - a.product_count)
      .slice(0, departmentId ? undefined : 24)
  }, [departments, departmentId])

  if (isLoading) {
    return (
      <div data-testid="category-browse" dir={dir} className={cn('space-y-3', className)}>
        {!railOnly ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-xl" />
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!departments.length) return null

  const visibleDepartments = departments.filter((d) => d.product_count > 0)

  return (
    <section data-testid="category-browse" dir={dir} className={cn('space-y-3', className)}>
      {!railOnly && visibleDepartments.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {visibleDepartments.map((dept) => (
            <DepartmentTile key={dept.id} dept={dept} language={i18n.language} />
          ))}
        </div>
      ) : null}
      {railCategories.length > 0 ? (
        <nav aria-label={t('categories.railLabel')}>
          <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {railCategories.map((cat) => (
              <li key={cat.id} className="shrink-0">
                <RailChip cat={cat} active={cat.slug === activeSlug} language={i18n.language} />
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  )
}

function DepartmentTile({ dept, language }: { dept: CategoryDepartment; language: string }) {
  const { t } = useTranslation('products')
  return (
    <Link
      to={categoryPath(dept.slug)}
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3',
        'transition-[border-color,transform] duration-150 ease-out hover:border-[var(--app-border-mid)] active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]'
      )}
    >
      <CategoryIconBadge iconKey={dept.icon_key} tintKey={dept.slug} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text)]">
          {localizedName(dept, language)}
        </span>
        <span className="block text-xs tabular-nums text-[var(--text-muted)]">
          {t('categories.productCount', { count: dept.product_count })}
        </span>
      </span>
      <ChevronRight
        data-testid="category-tile-chevron"
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-[var(--text-muted)] rtl:-scale-x-100"
      />
    </Link>
  )
}

function RailChip({
  cat,
  active,
  language,
}: {
  cat: CategoryNode
  active: boolean
  language: string
}) {
  return (
    <Link
      to={categoryPath(cat.slug)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors duration-150',
        active
          ? 'border-[var(--brand)] bg-[var(--brand-pale)] font-medium text-[var(--brand-mid)]'
          : 'border-[var(--app-border)] text-[var(--text-mid)] hover:bg-[var(--app-bg-subtle)]'
      )}
    >
      <CategoryIconBadge iconKey={cat.icon_key} size="sm" />
      <span>{localizedName(cat, language)}</span>
      <span className="text-xs tabular-nums text-[var(--text-muted)]">{cat.product_count}</span>
    </Link>
  )
}

/**
 * The "Categories" group for a catalog search: leaf categories whose name or alias matches,
 * with the caller's visible product count. Hidden until the query has 2+ characters.
 */
export function CategorySearchHits({ query, className }: { query: string; className?: string }) {
  const { t, i18n } = useTranslation('products')
  const q = query.trim()
  const { data } = useSearchQuery({ q, grouped: true, limit: 5 }, { skip: q.length < 2 })
  const hits = ((data && 'categories' in data ? data.categories : undefined) ??
    []) as SearchCategoryHit[]
  if (q.length < 2 || hits.length === 0) return null
  return (
    <nav
      aria-label={t('categories.searchGroupLabel')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <span className="text-xs font-medium text-[var(--text-muted)]">
        {t('categories.searchGroupLabel')}
      </span>
      {hits.map((hit) => (
        <RailChip key={hit.id} cat={hit as CategoryNode} active={false} language={i18n.language} />
      ))}
    </nav>
  )
}
