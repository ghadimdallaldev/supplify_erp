import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function PageShell({
  children,
  className,
  maxWidth,
  padding,
  'data-testid': testId,
}: {
  children: ReactNode
  className?: string
  /** focused ~960px; default 1280px; wide 1440px; full unconstrained */
  maxWidth?: 'focused' | 'default' | 'wide' | 'full'
  /** Apply shared responsive horizontal padding */
  padding?: boolean
  'data-testid'?: string
}) {
  const maxWidthClass =
    maxWidth === 'focused'
      ? 'max-w-[var(--content-max-focused)]'
      : maxWidth === 'wide'
        ? 'max-w-[var(--content-max-wide)]'
        : maxWidth === 'full'
          ? 'max-w-none'
          : 'max-w-[var(--content-max)]'

  return (
    <div
      className={cn(
        'page-stack mx-auto w-full min-w-0',
        maxWidthClass,
        padding && 'content-padding-x',
        className
      )}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
