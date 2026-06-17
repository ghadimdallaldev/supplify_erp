import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { AppPanel } from '../ui/app-panel'
import { Badge } from '../ui/badge'
import { Select, SelectTrigger } from '../ui/select'
import { TableScroll } from '../ui/table-scroll'
import { useGetAdminUsersQuery } from '../../services/api'
import { AdminResetPasswordDialog, type AdminResetPasswordTarget } from './AdminResetPasswordDialog'
import {
  AdminEmptyState,
  AdminLoadingSkeleton,
  AdminSectionHeader,
  formatAdminDate,
} from './adminUi'
import { KeyRound, Loader2, Search, Users, X } from 'lucide-react'
import { cn } from '../../lib/utils'

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
  if (normalized.includes('admin')) return 'bg-violet-50 text-violet-700 border-violet-200'
  if (normalized.includes('owner')) return 'bg-amber-50 text-amber-800 border-amber-200'
  if (normalized.includes('manager')) return 'bg-sky-50 text-sky-800 border-sky-200'
  return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
}

export function AdminUsersTab() {
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

  const users = data?.users ?? []

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
      <AdminSectionHeader
        title="Users"
        description="Search platform accounts, review tenant access, and reset sign-in passwords."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder="Search by email or display name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              className="h-10 w-full min-w-[160px] sm:w-auto"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
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
            Clear filters
          </Button>
        )}
      </div>

      <AppPanel
        title="Platform users"
        description={
          isLoading
            ? 'Loading directory…'
            : `${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'} shown${users.length !== filteredUsers.length ? ` of ${users.length}` : ''}`
        }
        testId="admin-users-panel"
        footer={
          isFetching && !isLoading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating results…
            </p>
          ) : undefined
        }
      >
        {isLoading ? (
          <AdminLoadingSkeleton rows={6} />
        ) : filteredUsers.length === 0 ? (
          <AdminEmptyState
            icon={<Users className="h-8 w-8 text-[var(--text-muted)]" />}
            title={hasActiveFilters ? 'No users match your filters' : 'No users found'}
            description={
              hasActiveFilters
                ? 'Try a different search term or role filter.'
                : 'Users appear here after they register or are invited to a tenant.'
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
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableScroll aria-label="Platform users">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="hidden px-4 py-3 md:table-cell">Tenant access</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Joined</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)]">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-[var(--brand-ultra)]/35">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-xs font-semibold text-[var(--brand)]"
                          aria-hidden
                        >
                          {userInitials(user)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[var(--text)]">
                            {user.display_name || user.email}
                          </p>
                          <p className="truncate text-xs text-[var(--text-muted)]">{user.email}</p>
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
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      {Array.isArray(user.tenant_roles) && user.tenant_roles.length > 0 ? (
                        <div className="flex max-w-xs flex-wrap gap-1.5">
                          {user.tenant_roles.slice(0, 4).map((tr, index) => (
                            <Badge
                              key={`${user.id}-${tr.tenantId ?? index}`}
                              variant="outline"
                              className="text-[11px] font-normal"
                            >
                              {tr.roleName || 'Member'}
                              {tr.tenantType ? ` · ${tr.tenantType}` : ''}
                            </Badge>
                          ))}
                          {user.tenant_roles.length > 4 && (
                            <Badge variant="outline" className="text-[11px] font-normal">
                              +{user.tenant_roles.length - 4} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">No tenant links</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 text-xs text-[var(--text-muted)] lg:table-cell">
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
                      >
                        <KeyRound className="mr-1.5 h-4 w-4" />
                        Reset password
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
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
