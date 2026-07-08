import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from './button'

export function TablePagination({
  summary,
  hasPrevPage,
  hasNextPage,
  isFetching = false,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  className,
  'data-testid': testId,
}: {
  summary: ReactNode
  hasPrevPage: boolean
  hasNextPage: boolean
  isFetching?: boolean
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  className?: string
  'data-testid'?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-[var(--app-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      data-testid={testId}
    >
      <p className="text-sm text-[var(--text-muted)]">{summary}</p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasPrevPage || isFetching}
          onClick={onPrev}
          data-testid={testId ? `${testId}-prev` : undefined}
        >
          <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
          {prevLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasNextPage || isFetching}
          onClick={onNext}
          data-testid={testId ? `${testId}-next` : undefined}
        >
          {nextLabel}
          <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}
