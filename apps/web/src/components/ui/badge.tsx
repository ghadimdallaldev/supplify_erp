import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[10px] font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/30 focus:ring-offset-2 focus:ring-offset-[var(--surface)]',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[var(--brand-pale)] text-[var(--brand-mid)] hover:opacity-90',
        secondary:
          'border-transparent bg-[var(--brand-ultra)] text-[var(--text-mid)] hover:bg-[var(--brand-pale)]',
        destructive:
          'border-transparent bg-[var(--red-pale)] text-[var(--red)] hover:opacity-90',
        outline: 'border-[var(--app-border-mid)] bg-transparent text-[var(--text-mid)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
