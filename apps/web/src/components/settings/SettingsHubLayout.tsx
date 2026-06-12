import type { ReactNode } from 'react'
import { PageHeader } from '../ui/page-header'
import { PageShell } from '../ui/page-shell'

export function SettingsHubLayout({
  title,
  description,
  stats,
  children,
}: {
  title: string
  description?: string
  stats?: ReactNode
  children: ReactNode
}) {
  return (
    <PageShell>
      <PageHeader title={title} description={description} />
      {stats}
      {children}
    </PageShell>
  )
}
