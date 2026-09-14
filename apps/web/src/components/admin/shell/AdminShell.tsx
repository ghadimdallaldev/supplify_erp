import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { AdminSidebar } from './AdminSidebar'
import { AdminTopBar } from './AdminTopBar'
import { AdminShellNavProvider, useAdminShellNavContext } from './adminShellContext'
import { readSidebarCollapsed, writeSidebarCollapsed } from './adminShellPrefs'

export const ADMIN_MAIN_CONTENT_ID = 'admin-main-content'

function AdminShellFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation('admin')
  const { pathname } = useLocation()
  const { nav } = useAdminShellNavContext()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      writeSidebarCollapsed(next)
      return next
    })
  }, [])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname])

  // Mobile drawer: Escape closes it and the page behind it stops scrolling.
  useEffect(() => {
    if (!mobileNavOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileNavOpen])

  return (
    <div className="admin-shell" data-testid="admin-shell" data-sidebar-collapsed={collapsed}>
      <a href={`#${ADMIN_MAIN_CONTENT_ID}`} className="admin-skip-link">
        {t('nav.skipToContent')}
      </a>

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
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className="admin-shell-main">
        <AdminTopBar
          selectedTab={nav?.selectedTab}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main
          id={ADMIN_MAIN_CONTENT_ID}
          tabIndex={-1}
          className="admin-shell-content flex min-h-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
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
