import * as React from 'react'
import { cn } from '../../lib/utils'

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & { error?: boolean }
>(({ className, type, error, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition-colors duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--text-muted)] hover:border-[var(--brand-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:border-[var(--brand-mid)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--app-border-mid)]',
        error && 'border-[var(--red)] focus-visible:ring-[var(--red)]/30 error',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
