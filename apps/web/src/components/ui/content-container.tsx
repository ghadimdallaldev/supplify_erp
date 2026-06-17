import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/** Inner focused wrapper for forms inside wider page shells. */
export function ContentContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full min-w-0 max-w-[var(--content-max-focused)]', className)}>
      {children}
    </div>
  )
}
