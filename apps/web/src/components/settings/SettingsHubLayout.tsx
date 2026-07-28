import type { ReactNode } from 'react'
import { PageHeader } from '../ui/page-header'
import { PageShell } from '../ui/page-shell'

export function SettingsHubLayout({
  title,
  description,
  stats,
  children,
  testId = 'restaurant-settings-page',
}: {
  title: string
  description?: string
  stats?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <PageShell maxWidth="default" padding className="w-full overflow-x-hidden" data-testid={testId}>
      <PageHeader title={title} description={description} />
      {stats}
      {children}
    </PageShell>
  )
}
