import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'

import { cn } from '../../lib/utils'

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const dialogContentVariants = cva(
  [
    'fixed left-[50%] top-[50%] z-50 w-[calc(100vw-var(--dialog-margin-x))] translate-x-[-50%] translate-y-[-50%]',
    'max-h-[var(--dialog-max-height)] border border-[var(--app-border)] bg-[var(--surface)] text-[var(--text)] shadow-xl',
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
    'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
    'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
    'data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none',
    'motion-reduce:data-[state=closed]:zoom-out-100 motion-reduce:data-[state=open]:zoom-in-100',
    'sm:w-full sm:rounded-xl',
  ],
  {
    variants: {
      size: {
        sm: 'max-w-[min(var(--dialog-sm),calc(100vw-2*var(--dialog-margin-x)))]',
        md: 'max-w-[min(var(--dialog-md),calc(100vw-2*var(--dialog-margin-x)))]',
        lg: 'max-w-[min(var(--dialog-lg),calc(100vw-2*var(--dialog-margin-x)))]',
        xl: 'max-w-[min(var(--dialog-xl),calc(100vw-2*var(--dialog-margin-x)))]',
        wide: 'max-w-[min(var(--dialog-wide),calc(100vw-2*var(--dialog-margin-x)))]',
        fullscreen:
          'max-w-[calc(100vw-2*var(--dialog-margin-x))] max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:translate-y-0 max-sm:rounded-xl',
      },
      scroll: {
        body: 'grid gap-4 overflow-y-auto p-4 sm:p-6',
        split: 'flex flex-col overflow-hidden p-0',
      },
    },
    defaultVariants: {
      size: 'md',
      scroll: 'body',
    },
  }
)

function treeHasDialogDescription(node: React.ReactNode): boolean {
  for (const child of React.Children.toArray(node)) {
    if (!React.isValidElement(child)) continue
    if (child.type === DialogDescription || child.type === DialogPrimitive.Description) {
      return true
    }
    if (treeHasDialogDescription(child.props.children)) return true
  }
  return false
}

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, size, scroll, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
  const hasDescription = treeHasDialogDescription(children)
  const describedByProps =
    hasDescription && ariaDescribedBy === undefined
      ? {}
      : { 'aria-describedby': ariaDescribedBy ?? undefined }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(dialogContentVariants({ size, scroll }), className)}
        {...props}
        {...describedByProps}
      >
        {children}
        <DialogPrimitive.Close className="absolute end-4 top-4 z-10 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--brand-mid)]/40 focus:ring-offset-2 focus:ring-offset-[var(--surface)] disabled:pointer-events-none data-[state=open]:bg-[var(--brand-ultra)] data-[state=open]:text-[var(--text-muted)] erp-pressable">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 text-center sm:text-start', className)}
    {...props}
  />
)
DialogHeader.displayName = 'DialogHeader'

const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4 sm:px-6 sm:pt-6',
      className
    )}
    {...props}
  />
)
DialogBody.displayName = 'DialogBody'

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse gap-2 border-t border-[var(--app-border)] pt-4 sm:flex-row sm:justify-end sm:gap-2 sm:border-0 sm:pt-0',
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight text-[var(--text)]',
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-[var(--text-muted)]', className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  dialogContentVariants,
}
