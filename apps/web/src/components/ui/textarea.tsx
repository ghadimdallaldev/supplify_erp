import * as React from 'react'

import { cn } from '../../lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] transition-colors duration-150 placeholder:text-[var(--text-muted)] hover:border-[var(--brand-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:border-[var(--brand-mid)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--app-border-mid)]',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Textarea }
