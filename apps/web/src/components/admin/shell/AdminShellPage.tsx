import type { ReactNode } from 'react'
import { PageShell } from '../../ui/page-shell'

type AdminShellPageMaxWidth = 'focused' | 'default' | 'wide' | 'full'

/** Standard inner page wrapper for routes rendered inside {@link AdminShell}. */
export function AdminShellPage({
  children,
  maxWidth = 'wide',
  'data-testid': testId,
}: {
  children: ReactNode
  /** Dashboard-style pages use `wide`; settings and forms read better at `focused` or `default`. */
  maxWidth?: AdminShellPageMaxWidth
  'data-testid'?: string
}) {
  return (
    <div className="admin-page-shell flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden">
      <PageShell
        maxWidth={maxWidth}
        className="min-h-0 w-full min-w-0 flex-1 px-4 py-4 sm:px-6 sm:py-5"
        data-testid={testId}
      >
        {children}
      </PageShell>
    </div>
  )
}
