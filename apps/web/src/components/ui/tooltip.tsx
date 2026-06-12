import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '../../lib/utils'

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { instant?: boolean }
>(({ className, sideOffset = 4, instant, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      data-instant={instant ? '' : undefined}
      className={cn(
        'z-[400] overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text)] shadow-md',
        'origin-[var(--radix-tooltip-content-transform-origin)]',
        'transition-[transform,opacity] duration-150 ease-out',
        'data-[state=delayed-open]:animate-none data-[state=instant-open]:animate-none',
        'data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97]',
        'data-[state=delayed-open]:opacity-100 data-[state=delayed-open]:scale-100',
        'data-[state=instant-open]:opacity-100 data-[state=instant-open]:scale-100',
        'data-[instant]:duration-0',
        'motion-reduce:transition-none motion-reduce:scale-100',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
