import type { ReactNode } from 'react'
import { PageHeader } from '../ui/page-header'

/** @deprecated Use PageHeader with size="compact" instead */
export function AdminPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return <PageHeader title={title} subtitle={subtitle} action={action} size="compact" />
}
