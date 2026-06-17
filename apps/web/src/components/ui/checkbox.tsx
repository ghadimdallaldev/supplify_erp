import * as React from 'react'
import { cn } from '../../lib/utils'

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        'h-4 w-4 shrink-0 rounded border border-[var(--app-border)] accent-[var(--brand)]',
        className
      )}
      {...props}
    />
  )
)
Checkbox.displayName = 'Checkbox'
