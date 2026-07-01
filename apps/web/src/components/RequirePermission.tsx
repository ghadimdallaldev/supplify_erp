import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppSelector } from '../hooks/redux'
import { usePermissions } from '../hooks/usePermissions'
import { isTenantOwner } from '../lib/tenantRoles'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

type Props = {
  permission?: string
  anyOf?: readonly string[]
  title?: string
  /** Allow workspace Owner / Org Owner through (e.g. before RBAC sync adds new keys). */
  allowOwner?: boolean
  children: ReactNode
}

/** Blocks direct URL access when the user lacks view permission for a page. */
export function RequirePermission({ permission, anyOf, title, allowOwner, children }: Props) {
  const { t } = useTranslation('common')
  const { user } = useAppSelector((state) => state.auth)
  const { can, canAny } = usePermissions()
  const allowed =
    (anyOf?.length ? canAny(...anyOf) : permission ? can(permission) : true) ||
    (allowOwner === true && isTenantOwner(user))

  if (allowed) return <>{children}</>

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6" role="alert">
      <Card className="w-full max-w-md border-[var(--app-border)]">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--text-mid)]">
            <ShieldOff className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <CardTitle className="text-[var(--text)]">{t('accessRestricted.title')}</CardTitle>
          </div>
          <CardDescription className="text-[var(--text-muted)]">
            {t('accessRestricted.description', {
              area: title ?? t('accessRestricted.defaultArea'),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  )
}
