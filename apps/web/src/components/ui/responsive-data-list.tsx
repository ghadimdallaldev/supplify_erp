import type { ReactNode } from 'react'
import { Fragment } from 'react'
import { cn } from '../../lib/utils'
import { TableScroll } from './table-scroll'

export type TableDensity = 'compact' | 'full'

export type CardBreakpoint = 'md' | 'lg' | 'xl'

/**
 * Tailwind class helpers for hybrid card/table data lists.
 *
 * Viewport tiers:
 * - Below card breakpoint: card list
 * - At/above card breakpoint: table list
 * - xl+: full column/action density where row classes opt in
 *
 * Column visibility (apply on th/td):
 * - Primary identifier + primary action: always visible in table mode
 * - `columnSecondary`: stock, status — hidden lg:table-cell
 * - `columnTertiary`: supplier, tags, metadata — hidden xl:table-cell
 *
 * Actions:
 * - Card: CardActionGrid / flex-wrap (never viewport breakpoints inside cards)
 * - Compact table: icon buttons with aria-label + title; labels via actionLabel
 * - Full table: labeled buttons
 */
export const responsiveDataListClasses = {
  cardContainer: (breakpoint: CardBreakpoint = 'xl') =>
    ({
      md: 'md:hidden',
      lg: 'lg:hidden',
      xl: 'xl:hidden',
    })[breakpoint],
  tableContainer: (breakpoint: CardBreakpoint = 'xl') =>
    ({
      md: 'hidden md:block',
      lg: 'hidden lg:block',
      xl: 'hidden xl:block',
    })[breakpoint],
  columnSecondary: 'hidden lg:table-cell',
  columnTertiary: 'hidden xl:table-cell',
  actionLabel: 'hidden xl:inline',
  actionIconGap: 'xl:me-1',
  tagsInCell: 'hidden xl:flex',
} as const

export type ResponsiveDataListProps<T> = {
  items: T[]
  keyExtractor: (item: T) => string
  renderCard: (item: T) => ReactNode
  /** Render a table row. Use xl: Tailwind classes for compact vs full density. */
  renderTableRow: (item: T, index: number) => ReactNode
  tableHeader: ReactNode
  tableAriaLabel: string
  tableMinWidth?: number
  cardBreakpoint?: CardBreakpoint
  emptyState?: ReactNode
  className?: string
}

export function ResponsiveDataList<T>({
  items,
  keyExtractor,
  renderCard,
  renderTableRow,
  tableHeader,
  tableAriaLabel,
  tableMinWidth = 640,
  cardBreakpoint = 'xl',
  emptyState,
  className,
}: ResponsiveDataListProps<T>) {
  if (items.length === 0) {
    return emptyState ? <>{emptyState}</> : null
  }

  return (
    <div className={className}>
      <div
        className={cn(
          'divide-y divide-[var(--app-border)]',
          responsiveDataListClasses.cardContainer(cardBreakpoint)
        )}
        data-testid="responsive-data-list-cards"
      >
        {items.map((item) => (
          <div key={keyExtractor(item)}>{renderCard(item)}</div>
        ))}
      </div>
      <TableScroll
        aria-label={tableAriaLabel}
        className={responsiveDataListClasses.tableContainer(cardBreakpoint)}
        data-testid="responsive-data-list-table"
      >
        <table className="w-full border-collapse" style={{ minWidth: tableMinWidth }}>
          {tableHeader}
          <tbody>
            {items.map((item, index) => (
              <Fragment key={keyExtractor(item)}>{renderTableRow(item, index)}</Fragment>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  )
}
