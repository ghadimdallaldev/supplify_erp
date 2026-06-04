import { cn } from '../../lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md bg-[var(--app-border)]', className)}
      {...props}
    />
  )
}

export { Skeleton }
