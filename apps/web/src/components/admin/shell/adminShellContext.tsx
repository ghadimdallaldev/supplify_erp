import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
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
  setNav: (nav: AdminShellNavState | null) => void
}

const AdminShellNavContext = createContext<AdminShellNavContextValue | null>(null)

export function AdminShellNavProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<AdminShellNavState | null>(null)
  const value = useMemo(() => ({ nav, setNav }), [nav])
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
  const { setNav } = useAdminShellNavContext()

  useLayoutEffect(() => {
    setNav(nav)
    return () => setNav(null)
  }, [nav, setNav])
}
