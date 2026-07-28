import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AppPanel } from '../ui/app-panel'
import { Badge } from '../ui/badge'
import { Select, SelectTrigger } from '../ui/select'
import { TableScroll } from '../ui/table-scroll'
import { responsiveDataListClasses } from '../ui/responsive-data-list'
import { cn } from '../../lib/utils'
import { useGetAdminUsersQuery } from '../../services/api'
import { AdminResetPasswordDialog, type AdminResetPasswordTarget } from './AdminResetPasswordDialog'
import {
  AdminEmptyState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
  formatAdminDate,
} from './adminUi'
import { KeyRound, Loader2, Search, Users, X } from 'lucide-react'

type AdminUserRow = {
  id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
  tenant_roles: Array<{ tenantId?: string; tenantType?: string; roleName?: string }>
}

function userInitials(user: AdminUserRow): string {
  const source = user.display_name || user.email
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function roleTone(role: string): string {
  const normalized = role.toLowerCase()
  if (normalized.includes('admin'))
    return 'bg-[var(--app-bg-subtle)] text-[var(--text)] border-[var(--app-border-mid)]'
  if (normalized.includes('owner')) return 'bg-amber-50 text-amber-800 border-amber-200'
  if (normalized.includes('manager')) return 'bg-sky-50 text-sky-800 border-sky-200'
  return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
}

export function AdminUsersTab() {
  const { t } = useTranslation('admin')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [resetTarget, setResetTarget] = useState<AdminResetPasswordTarget | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => window.clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetching } = useGetAdminUsersQuery(
    { search: debouncedSearch || undefined, limit: 100 },
    { skip: false }
  )

  const users = useMemo(() => data?.users ?? [], [data?.users])

  const roleOptions = useMemo(() => {
    const roles = new Set<string>()
    users.forEach((user) => {
      if (user.role) roles.add(String(user.role).toLowerCase())
    })
    return Array.from(roles).sort()
  }, [users])

  const filteredUsers = useMemo(() => {
    if (roleFilter === 'all') return users
    return users.filter((user) => String(user.role || '').toLowerCase() === roleFilter)
  }, [users, roleFilter])

  const hasActiveFilters = Boolean(debouncedSearch) || roleFilter !== 'all'

  return (
    <>
      <AdminSectionHeader title={t('users.title')} description={t('users.description')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('users.searchAriaLabel')}
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              className="h-10 w-full min-w-[160px] sm:w-auto"
              aria-label={t('users.filterRoleAriaLabel')}
            >
              <option value="all">{t('common.allRoles')}</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role.replace(/_/g, ' ')}
                </option>
              ))}
            </SelectTrigger>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 shrink-0 text-[var(--text-mid)]"
            onClick={() => {
              setSearch('')
              setDebouncedSearch('')
              setRoleFilter('all')
            }}
          >
            <X className="mr-1.5 h-4 w-4" />
            {t('common.clearFilters')}
          </Button>
        )}
      </div>

      <AppPanel
        title={t('users.platformUsers')}
        description={
          isLoading
            ? t('common.loadingDirectory')
            : users.length !== filteredUsers.length
              ? t('users.usersShownOf', {
                  filtered: filteredUsers.length,
                  total: users.length,
                  count: filteredUsers.length,
                })
              : t('users.usersShown', { count: filteredUsers.length })
        }
        testId="admin-users-panel"
        footer={
          isFetching && !isLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('common.updatingResults')}
            </p>
          ) : undefined
        }
      >
        {isLoading ? (
          <AdminLoadingSkeleton rows={6} />
        ) : filteredUsers.length === 0 ? (
          <AdminEmptyState
            icon={<Users className="h-8 w-8 text-[var(--text-muted)]" />}
            title={hasActiveFilters ? t('users.emptyFilteredTitle') : t('users.emptyDefaultTitle')}
            description={
              hasActiveFilters
                ? t('users.emptyFilteredDescription')
                : t('users.emptyDefaultDescription')
            }
            action={
              hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setDebouncedSearch('')
                    setRoleFilter('all')
                  }}
                >
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {filteredUsers.map((user) => (
                <article
                  key={user.id}
                  className="rounded-md border border-[var(--app-border)] p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--app-border-mid)] bg-[var(--app-bg-subtle)] text-xs font-semibold text-[var(--text-mid)]"
                      aria-hidden
                    >
                      {userInitials(user)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--text)]">
                        {user.display_name || user.email}
                      </p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
                      <Badge
                        variant="outline"
                        className={cn('mt-2 text-xs capitalize', roleTone(String(user.role || '')))}
                      >
                        {String(user.role || 'unknown')
                          .replace(/_/g, ' ')
                          .toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setResetTarget({
                        userId: user.id,
                        email: user.email,
                        displayName: user.display_name,
                      })
                    }
                  >
                    <KeyRound className="mr-1.5 h-4 w-4" />
                    {t('users.resetPassword')}
                  </Button>
                </article>
              ))}
            </div>
            <TableScroll
              aria-label={t('users.platformUsersTableAriaLabel')}
              className="hidden lg:block"
            >
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-4 py-3">{t('common.table.user')}</th>
                    <th className="px-4 py-3">{t('common.table.role')}</th>
                    <th
                      className={cn('hidden px-4 py-3', responsiveDataListClasses.columnSecondary)}
                    >
                      {t('common.table.tenantAccess')}
                    </th>
                    <th
                      className={cn('hidden px-4 py-3', responsiveDataListClasses.columnTertiary)}
                    >
                      {t('common.table.joined')}
                    </th>
                    <th className="px-4 py-3 text-right">{t('common.table.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--app-border-mid)] bg-[var(--app-bg-subtle)] text-xs font-semibold text-[var(--text-mid)]"
                            aria-hidden
                          >
                            {userInitials(user)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[var(--text)]">
                              {user.display_name || user.email}
                            </p>
                            <p className="truncate text-xs text-[var(--text-muted)]">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={cn('text-xs capitalize', roleTone(String(user.role || '')))}
                        >
                          {String(user.role || 'unknown')
                            .replace(/_/g, ' ')
                            .toLowerCase()}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          'hidden px-4 py-3.5',
                          responsiveDataListClasses.columnSecondary
                        )}
                      >
                        {Array.isArray(user.tenant_roles) && user.tenant_roles.length > 0 ? (
                          <div className="flex max-w-xs flex-wrap gap-1.5">
                            {user.tenant_roles.slice(0, 4).map((tr, index) => (
                              <Badge
                                key={`${user.id}-${tr.tenantId ?? index}`}
                                variant="outline"
                                className="text-[11px] font-normal"
                              >
                                {tr.roleName || t('common.member')}
                                {tr.tenantType ? ` · ${tr.tenantType}` : ''}
                              </Badge>
                            ))}
                            {user.tenant_roles.length > 4 && (
                              <Badge variant="outline" className="text-[11px] font-normal">
                                {t('common.more', { count: user.tenant_roles.length - 4 })}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            {t('common.noTenantLinks')}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'hidden px-4 py-3.5 text-xs text-[var(--text-muted)]',
                          responsiveDataListClasses.columnTertiary
                        )}
                      >
                        {formatAdminDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setResetTarget({
                              userId: user.id,
                              email: user.email,
                              displayName: user.display_name,
                            })
                          }
                          title={t('users.resetPassword')}
                        >
                          <KeyRound className="h-4 w-4 xl:mr-1.5" />
                          <span className={responsiveDataListClasses.actionLabel}>
                            {t('users.resetPassword')}
                          </span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </AppPanel>

      <AdminResetPasswordDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        target={resetTarget}
      />
    </>
  )
}
