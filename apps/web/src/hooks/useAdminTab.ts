import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type {
  AdminCanTabMap,
  AdminTabKey,
} from '../components/admin/dashboard/adminDashboardShared'
import {
  adminTabPath,
  defaultTabForPortal,
  isAdminTabKey,
  isValidTabForPortal,
  resolveAdminTabFromPath,
  type AdminPortal,
} from '../components/admin/shell/adminNavConfig'

const FALLBACK_TABS: AdminTabKey[] = [
  'overview',
  'finance',
  'tenants',
  'users',
  'plans',
  'subscriptions',
  'activity',
]

function resolveTabWithPermissions(
  candidate: AdminTabKey,
  portal: AdminPortal,
  canAdminTab: AdminCanTabMap
): AdminTabKey {
  let tab = candidate
  if (!isValidTabForPortal(tab, portal)) {
    tab = defaultTabForPortal(portal)
  }
  if (canAdminTab[tab] === false) {
    return (
      FALLBACK_TABS.find(
        (fallback) => canAdminTab[fallback] && isValidTabForPortal(fallback, portal)
      ) ?? defaultTabForPortal(portal)
    )
  }
  return tab
}

export function useAdminTab(
  portal: AdminPortal,
  canAdminTab: AdminCanTabMap,
  preferredTab?: string
) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const didApplyPreferred = useRef(false)

  // Migrate legacy ?tab= links to path-based routes.
  useEffect(() => {
    const legacyTab = searchParams.get('tab')
    if (!legacyTab || !isAdminTabKey(legacyTab)) return
    const next = new URLSearchParams(searchParams)
    next.delete('tab')
    const search = next.toString()
    navigate(
      {
        pathname: adminTabPath(portal, legacyTab),
        search: search ? `?${search}` : '',
      },
      { replace: true }
    )
  }, [searchParams, portal, navigate])

  const selectedTab = useMemo(() => {
    const fromPath = resolveAdminTabFromPath(pathname, portal)
    const candidate = fromPath ?? defaultTabForPortal(portal)
    return resolveTabWithPermissions(candidate, portal, canAdminTab)
  }, [pathname, portal, canAdminTab])

  // On first visit to a portal base path, honor the admin's preferred landing tab once.
  useEffect(() => {
    if (didApplyPreferred.current) return
    const fromPath = resolveAdminTabFromPath(pathname, portal)
    if (fromPath !== null) {
      didApplyPreferred.current = true
      return
    }

    const preferred = isAdminTabKey(preferredTab) ? preferredTab : defaultTabForPortal(portal)
    const resolved = resolveTabWithPermissions(preferred, portal, canAdminTab)
    didApplyPreferred.current = true

    if (resolved !== defaultTabForPortal(portal)) {
      navigate(adminTabPath(portal, resolved), { replace: true })
    }
  }, [pathname, portal, preferredTab, canAdminTab, navigate])

  const setSelectedTab = useCallback(
    (tab: AdminTabKey) => {
      if (!isValidTabForPortal(tab, portal)) return
      if (canAdminTab[tab] === false) return
      navigate(adminTabPath(portal, tab))
    },
    [portal, canAdminTab, navigate]
  )

  return { selectedTab, setSelectedTab }
}
