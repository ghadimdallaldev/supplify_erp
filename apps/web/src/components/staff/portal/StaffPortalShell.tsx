import type { ReactNode } from 'react'
import { CalendarDays, ClipboardList, Home, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { cn } from '../../../lib/utils'

export type StaffPortalTab = 'home' | 'schedule' | 'requests' | 'more'

const TAB_CONFIG: Array<{
  id: StaffPortalTab
  labelKey: 'home' | 'shifts' | 'requests' | 'more'
  icon: typeof Home
}> = [
  { id: 'home', labelKey: 'home', icon: Home },
  { id: 'schedule', labelKey: 'shifts', icon: CalendarDays },
  { id: 'requests', labelKey: 'requests', icon: ClipboardList },
  { id: 'more', labelKey: 'more', icon: MoreHorizontal },
]

type StaffPortalShellProps = {
  staffName: string
  role: string
  clockLabel: string
  isClockedIn: boolean
  checkingIn: boolean
  checkingOut: boolean
  onClockIn: () => void
  onClockOut: () => void
  onSignOut: () => void
  signOutLabel: string
  activeTab: StaffPortalTab
  onTabChange: (tab: StaffPortalTab) => void
  tabBadges?: Partial<Record<StaffPortalTab, number>>
  children: ReactNode
}

export function StaffPortalShell({
  staffName,
  role,
  clockLabel,
  isClockedIn,
  checkingIn,
  checkingOut,
  onClockIn,
  onClockOut,
  onSignOut,
  signOutLabel,
  activeTab,
  onTabChange,
  tabBadges,
  children,
}: StaffPortalShellProps) {
  const { t } = useTranslation('staff')

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--brand-ultra)]">
      <header className="sticky top-0 z-40 border-b border-[var(--app-border)] bg-[var(--surface)] pwa-safe-top">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:gap-3 sm:py-3 sm:px-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-sm font-semibold text-[var(--brand-mid)]">
            {staffName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--text)]">{staffName}</p>
            <p
              className={cn(
                'truncate text-xs',
                isClockedIn ? 'text-[var(--mint)]' : 'text-[var(--text-muted)]'
              )}
            >
              {clockLabel}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {isClockedIn ? (
              <Button
                variant="outline"
                size="sm"
                className="erp-pressable pwa-touch-target px-3"
                onClick={onClockOut}
                disabled={checkingOut}
              >
                {checkingOut ? t('portal.shell.clockingOut') : t('portal.shell.clockOut')}
              </Button>
            ) : (
              <Button
                size="sm"
                className="erp-pressable pwa-touch-target bg-[var(--mint)] px-3 hover:opacity-90"
                onClick={onClockIn}
                disabled={checkingIn}
              >
                {checkingIn ? t('portal.shell.clockingIn') : t('portal.shell.clockIn')}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="erp-pressable pwa-touch-target hidden text-[var(--text-muted)] sm:inline-flex"
              onClick={onSignOut}
            >
              {signOutLabel}
            </Button>
          </div>
        </div>
        <div
          className="mx-auto hidden max-w-3xl gap-1 overflow-x-auto px-4 pb-2 scrollbar-none sm:flex sm:px-6"
          role="tablist"
          aria-label={t('portal.shell.sectionsAria')}
        >
          {TAB_CONFIG.map(({ id, labelKey, icon: Icon }) => {
            const active = activeTab === id
            const badge = tabBadges?.[id]
            const label = t(`portal.shell.${labelKey}`)
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(id)}
                className={cn(
                  'consumer-category-pill erp-pressable pwa-touch-target relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-[background-color,color] duration-150 ease-out',
                  active
                    ? 'bg-[var(--brand-mid)] text-white'
                    : 'text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
                {badge != null && badge > 0 ? (
                  <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] font-semibold text-white">
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pwa-main-with-bottom-nav sm:px-6 sm:py-5">
        <p className="mb-4 text-sm text-[var(--text-muted)]">{role}</p>
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-border)] bg-[var(--surface)] pwa-bottom-nav sm:hidden"
        aria-label={t('portal.shell.navAria')}
      >
        <div className="mx-auto flex max-w-3xl items-stretch justify-around px-1" role="tablist">
          {TAB_CONFIG.map(({ id, labelKey, icon: Icon }) => {
            const active = activeTab === id
            const badge = tabBadges?.[id]
            const label = t(`portal.shell.${labelKey}`)
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(id)}
                className={cn(
                  'erp-pressable relative flex min-h-[56px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors duration-150 ease-out',
                  active ? 'text-[var(--brand-mid)]' : 'text-[var(--text-muted)]'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={cn('h-5 w-5', active && 'text-[var(--brand-mid)]')} />
                {label}
                {badge != null && badge > 0 ? (
                  <span className="absolute right-[calc(50%-18px)] top-1.5 h-2 w-2 rounded-full bg-[var(--red)]" />
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default StaffPortalShell
