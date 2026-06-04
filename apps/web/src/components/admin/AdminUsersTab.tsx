import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { TableScroll } from '../ui/table-scroll'
import { useGetAdminUsersQuery } from '../../services/api'
import { AdminResetPasswordDialog, type AdminResetPasswordTarget } from './AdminResetPasswordDialog'
import { AdminLoadingState, AdminEmptyState } from './adminUi'
import { KeyRound, Loader2, Search } from 'lucide-react'

export function AdminUsersTab() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text)]">Users</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            Search platform users and reset sign-in passwords (Keycloak).
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            className="h-10 pl-9"
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <AdminLoadingState label="Loading users…" />
          ) : users.length === 0 ? (
            <AdminEmptyState
              title={debouncedSearch ? 'No users match your search' : 'No users found'}
              description={
                debouncedSearch
                  ? 'Try a different email or name.'
                  : 'Users appear here after they register or are invited to a tenant.'
              }
            />
          ) : (
            <TableScroll aria-label="Platform users">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Tenant access</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-[var(--app-border)]/70 hover:bg-[var(--brand-ultra)]/40"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">
                          {user.display_name || user.email}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs capitalize">
                          {String(user.role || '').toLowerCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--text-muted)] max-w-[240px]">
                        {Array.isArray(user.tenant_roles) && user.tenant_roles.length > 0 ? (
                          <span className="line-clamp-2">
                            {user.tenant_roles
                              .slice(0, 3)
                              .map(
                                (tr: { roleName?: string; tenantType?: string }) =>
                                  `${tr.roleName || 'Member'} (${tr.tenantType || '?'})`
                              )
                              .join(' · ')}
                            {user.tenant_roles.length > 3
                              ? ` +${user.tenant_roles.length - 3}`
                              : ''}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
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
                          <KeyRound className="h-4 w-4 mr-1" />
                          Reset password
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
          {isFetching && !isLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating…
            </p>
          )}
        </CardContent>
      </Card>

      <AdminResetPasswordDialog
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(null)}
        target={resetTarget}
      />
    </div>
  )
}
