import React from 'react'
import { Toaster as SonnerToaster } from 'sonner'

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            'text-sm !rounded-xl !border !border-[var(--app-border)] !bg-[var(--surface)] !text-[var(--text)] !shadow-lg',
          title: 'text-[var(--text)]',
          description: 'text-[var(--text-muted)]',
        },
        style: {
          maxWidth: 'min(420px, calc(100vw - 1.5rem))',
        },
      }}
      style={
        {
          '--width': 'min(420px, calc(100vw - 1.5rem))',
          top: 'max(0.75rem, env(safe-area-inset-top))',
        } as React.CSSProperties
      }
    />
  )
}
