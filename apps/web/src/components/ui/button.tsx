import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--brand)] text-white border border-[var(--brand)] shadow-sm shadow-[var(--brand)]/20 hover:bg-[var(--brand-mid)] hover:border-[var(--brand-mid)] hover:shadow-md hover:shadow-[var(--brand)]/25',
        destructive:
          'bg-[var(--red)] text-white border border-[var(--red)] shadow-sm shadow-[var(--red)]/20 hover:opacity-90 hover:shadow-md hover:shadow-[var(--red)]/25',
        outline:
          'border border-[var(--app-border-mid)] bg-transparent text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:border-[var(--brand-light)] hover:text-[var(--text)]',
        secondary:
          'bg-[var(--brand-ultra)] text-[var(--text-mid)] border border-[var(--app-border)] hover:bg-[var(--brand-pale)] hover:border-[var(--brand-light)]',
        ghost: 'text-[var(--text)] hover:bg-[var(--brand-ultra)]',
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
