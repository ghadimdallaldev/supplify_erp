import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import type { AdminCanTabMap, AdminTabKey } from '../dashboard/adminDashboardShared'

export type AdminShellNavState = {
  selectedTab: AdminTabKey
  setSelectedTab: (tab: AdminTabKey) => void
  canAdminTab: AdminCanTabMap
}

type AdminShellNavContextValue = {
  nav: AdminShellNavState | null
  registerNav: (nav: AdminShellNavState | null) => void
}

const AdminShellNavContext = createContext<AdminShellNavContextValue | null>(null)

function adminShellNavSyncKey(nav: AdminShellNavState | null): string {
  if (!nav) return ''
  return `${nav.selectedTab}:${JSON.stringify(nav.canAdminTab)}`
}

export function AdminShellNavProvider({ children }: { children: ReactNode }) {
  const navRef = useRef<AdminShellNavState | null>(null)
  const [revision, bumpRevision] = useReducer((count: number) => count + 1, 0)

  const registerNav = useCallback((next: AdminShellNavState | null) => {
    const prevKey = adminShellNavSyncKey(navRef.current)
    const nextKey = adminShellNavSyncKey(next)
    navRef.current = next
    if (prevKey !== nextKey) {
      bumpRevision()
    }
  }, [])

  const value = useMemo(
    () => ({ nav: navRef.current, registerNav }),
    // revision forces consumers to re-read navRef after registration changes
    [revision, registerNav]
  )

  return <AdminShellNavContext.Provider value={value}>{children}</AdminShellNavContext.Provider>
}

export function useAdminShellNavContext() {
  const ctx = useContext(AdminShellNavContext)
  if (!ctx) {
    throw new Error('useAdminShellNavContext must be used within AdminShellNavProvider')
  }
  return ctx
}

/** Register sidebar nav synchronously (before paint) so clicks always use current handlers. */
export function useRegisterAdminShellNav(nav: AdminShellNavState | null) {
  const { registerNav } = useAdminShellNavContext()
  const navRef = useRef(nav)
  navRef.current = nav
  const syncKey = adminShellNavSyncKey(nav)

  useLayoutEffect(() => {
    registerNav(navRef.current)
  }, [syncKey, registerNav])

  useLayoutEffect(() => {
    return () => registerNav(null)
  }, [registerNav])
}
