import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function PageShell({
  children,
  className,
  maxWidth,
  'data-testid': testId,
}: {
  children: ReactNode
  className?: string
  maxWidth?: 'default' | 'wide' | 'full'
  'data-testid'?: string
}) {
  const maxWidthClass =
    maxWidth === 'wide' ? 'max-w-[1400px]' : maxWidth === 'full' ? 'max-w-none' : 'max-w-[1200px]'

  return (
    <div
      className={cn('page-stack animate-fade-in mx-auto w-full min-w-0', maxWidthClass, className)}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
