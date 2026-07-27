import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,border-color,color,opacity] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--brand)] text-white border border-[var(--brand)] shadow-none hover:bg-[var(--brand-mid)] hover:border-[var(--brand-mid)]',
        destructive:
          'bg-[var(--red)] text-white border border-[var(--red)] shadow-none hover:opacity-90',
        outline:
          'border border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-mid)] hover:bg-[var(--app-bg-subtle)] hover:border-[var(--app-border-mid)] hover:text-[var(--text)]',
        secondary:
          'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border border-[var(--app-border)] hover:bg-[var(--surface-mid)] hover:border-[var(--app-border-mid)]',
        ghost: 'text-[var(--text)] hover:bg-[var(--app-bg-subtle)]',
        link: 'text-[var(--brand-mid)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        touch: 'min-h-[44px] h-11 px-4 py-2.5 text-base sm:min-h-0 sm:h-10 sm:text-sm',
        icon: 'h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-10 sm:min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
