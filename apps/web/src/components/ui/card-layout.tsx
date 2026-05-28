import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Standard card shell: prevents horizontal overflow in grids */
export const cardShellClass = 'overflow-hidden min-w-0'

/** Page / section header: stacks on narrow viewports */
export const pageHeaderRowClass =
  'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'

/** Row that splits label vs value/actions; wraps instead of overlapping */
export const splitRowClass =
  'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2'

/**
 * Action row for cards inside page grids. Always 2 columns so buttons never overlap
 * when the card is narrow but the viewport is wide (e.g. 3-column supplier grid).
 */
export function CardActionGrid({
  children,
  className,
  columns = 2,
}: {
  children: ReactNode
  className?: string
  columns?: 2 | 3
}) {
  return (
    <div
      className={cn(
        'grid w-full gap-2 border-t border-[var(--app-border)] pt-3',
        columns === 3 ? 'grid-cols-3' : 'grid-cols-2',
        className
      )}
    >
      {children}
    </div>
  )
}

/** Apply to buttons inside CardActionGrid (overrides default button nowrap) */
export function cardActionBtnClass(opts?: { iconOnly?: boolean; span?: 'full' }) {
  return cn(
    'h-auto min-h-9 w-full justify-center whitespace-normal px-2 py-2 text-xs leading-snug',
    opts?.span === 'full' && 'col-span-2',
    opts?.iconOnly && 'px-2.5'
  )
}

export function CardStatusBadges({
  children,
  className,
}: {
  children?: ReactNode
  className?: string
}) {
  if (!children) return null
  return <div className={cn('flex flex-wrap items-center gap-1.5', className)}>{children}</div>
}

export function CardMetaLine({
  icon: Icon,
  children,
  className,
  muted = true,
}: {
  icon: LucideIcon
  children: ReactNode
  className?: string
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 text-sm',
        muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-mid)]',
        className
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  )
}

export function CardFooterMeta({
  left,
  right,
  className,
}: {
  left?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-t border-[var(--app-border)] pt-2 text-xs text-[var(--text-muted)]',
        className
      )}
    >
      <div className={splitRowClass}>
        {left != null ? <span className="min-w-0 truncate">{left}</span> : <span />}
        {right ? (
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">{right}</span>
        ) : null}
      </div>
    </div>
  )
}

function normalizeAddressPart(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  if (!s || s === ',') return null
  return s
}

export function formatAddressLine(
  address: { city?: string; country?: string; line1?: string; street?: string } | null | undefined
): string | null {
  if (!address) return null
  const parts = [normalizeAddressPart(address.city), normalizeAddressPart(address.country)].filter(
    (p): p is string => Boolean(p)
  )
  return parts.length > 0 ? parts.join(', ') : null
}

export function formatStreetLine(
  address: { line1?: string; street?: string; address_line1?: string } | null | undefined
): string | null {
  if (!address) return null
  const street =
    normalizeAddressPart(address.line1) ??
    normalizeAddressPart(address.street) ??
    normalizeAddressPart(address.address_line1)
  return street
}

/** Location row for cards — never renders a lone comma */
export function CardAddressBlock({
  address,
  icon: Icon,
  fallback = 'Location not provided',
  showFallback = true,
  className,
}: {
  address: { city?: string; country?: string; line1?: string; street?: string } | null | undefined
  icon: LucideIcon
  fallback?: string
  showFallback?: boolean
  className?: string
}) {
  const line = formatAddressLine(address)
  const street = formatStreetLine(address)
  if (!line && !street) {
    if (!showFallback) return null
    return (
      <CardMetaLine icon={Icon} className={cn('italic', className)}>
        {fallback}
      </CardMetaLine>
    )
  }
  return (
    <div className={cn('space-y-1', className)}>
      {street ? <CardMetaLine icon={Icon}>{street}</CardMetaLine> : null}
      {line ? <CardMetaLine icon={Icon}>{line}</CardMetaLine> : null}
    </div>
  )
}
