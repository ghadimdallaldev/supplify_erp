import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'
import { AdminShellNavProvider, useAdminShellNavContext } from './adminShellContext'

function AdminShellFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation('admin')
  const { pathname } = useLocation()
  const { nav } = useAdminShellNavContext()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  return (
    <div className="admin-shell" data-testid="admin-shell">
      {mobileNavOpen && (
        <button
          type="button"
          className="admin-shell-backdrop lg:hidden"
          aria-label={t('nav.aria.closeMenu')}
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <AdminSidebar
        sectionNav={nav}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="admin-shell-main">
        <AdminTopBar
          selectedTab={nav?.selectedTab}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="admin-shell-content flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminShellNavProvider>
      <AdminShellFrame>{children}</AdminShellFrame>
    </AdminShellNavProvider>
  )
}

export { useRegisterAdminShellNav } from './adminShellContext'
