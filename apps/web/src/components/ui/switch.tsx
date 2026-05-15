import * as React from 'react'
import { cn } from '../../lib/utils'

export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label className="relative inline-flex cursor-pointer items-center">
        <input
          type="checkbox"
          className={cn('peer sr-only', className)}
          checked={checked}
          onChange={(event) => onCheckedChange?.(event.target.checked)}
          ref={ref}
          {...props}
        />
        <span className="h-5 w-9 rounded-full bg-[var(--app-border-mid)] transition peer-checked:bg-[var(--brand)]"></span>
        <span className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 translate-x-1 rounded-full bg-[var(--surface)] shadow transition peer-checked:translate-x-[19px]"></span>
      </label>
    )
  },
)
Switch.displayName = 'Switch'

