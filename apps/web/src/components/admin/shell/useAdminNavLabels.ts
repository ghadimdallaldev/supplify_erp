import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminTabKey } from '../dashboard/adminDashboardShared'
import {
  ADMIN_PLATFORM_NAV,
  ADMIN_PORTAL_LINKS,
  ADMIN_TENANT_PORTAL_NAV,
  type AdminNavGroup,
  type AdminNavGroupResolved,
} from './adminNavConfig'

export function useAdminTabLabels(): Record<AdminTabKey, string> {
  const { t } = useTranslation('admin')
  return useMemo(
    () => ({
      overview: t('nav.tabs.overview'),
      activity: t('nav.tabs.activity'),
      tenants: t('nav.tabs.tenants'),
      users: t('nav.tabs.users'),
      subscriptions: t('nav.tabs.subscriptions'),
      plans: t('nav.tabs.plans'),
      finance: t('nav.tabs.finance'),
      usage: t('nav.tabs.usage'),
      features: t('nav.tabs.features'),
      deals: t('nav.tabs.deals'),
      limits: t('nav.tabs.limits'),
      health: t('nav.tabs.health'),
      operations: t('nav.tabs.operations'),
      audit: t('nav.tabs.audit'),
    }),
    [t]
  )
}

function translateNavGroups(
  groups: AdminNavGroup[],
  t: (key: string) => string
): AdminNavGroupResolved[] {
  return groups.map((group) => ({
    label: t(`nav.groups.${group.labelKey}`),
    items: group.items.map((item) => ({
      tab: item.tab,
      label: t(`nav.tabs.${item.labelKey}`),
      icon: item.icon,
    })),
  }))
}

export function useAdminPlatformNav(): AdminNavGroupResolved[] {
  const { t } = useTranslation('admin')
  return useMemo(() => translateNavGroups(ADMIN_PLATFORM_NAV, t), [t])
}

export function useAdminTenantPortalNav(): AdminNavGroupResolved[] {
  const { t } = useTranslation('admin')
  return useMemo(() => translateNavGroups(ADMIN_TENANT_PORTAL_NAV, t), [t])
}

export function useAdminPortalLinks() {
  const { t } = useTranslation('admin')
  return useMemo(
    () =>
      ADMIN_PORTAL_LINKS.map((link) => ({
        ...link,
        label: t(`nav.portals.${link.id}`),
      })),
    [t]
  )
}
