import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Edit, Loader2, Lock, Plus, Trash2, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { RolePermissionChecklist } from './RolePermissionChecklist'
import { TableScroll } from './ui/table-scroll'
import { EmptyState } from './ui/empty-state'
import { labelForPermission } from '../lib/permissionLabels'
import { isEntitlementFeatureEnabled } from '../lib/planLimits'
import {
  useGetEntitlementsQuery,
  useGetTenantRolesQuery,
  useGetTenantRoleUsersQuery,
  useGetUnlinkedDriversQuery,
  useCreateTenantRoleMutation,
  useUpdateTenantRoleMutation,
  useDeleteTenantRoleMutation,
  useAssignTenantUserRoleMutation,
} from '../services/api'

function permissionSummary(permissions = []) {
  if (!permissions.length) return 'No permissions'
  if (permissions.length <= 3) {
    return permissions.map((p) => labelForPermission(p)).join(', ')
  }
  return `${permissions.length} permissions`
}

export function TeamRolesPanel({
  tenantType,
  teamMembers = [],
  teamMembersLoading = false,
  onAddMember,
  onRemoveMember,
  renderInviteForm,
}) {
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const advancedRolesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'advanced_roles'
  )
  const isSupplier = tenantType === 'SUPPLIER'
  const { data: unlinkedDriversData } = useGetUnlinkedDriversQuery(undefined, {
    skip: !isSupplier || !advancedRolesEnabled,
  })
  const unlinkedDrivers = unlinkedDriversData?.drivers ?? []

  const {
    data: rolesData,
    isLoading: rolesLoading,
    refetch: refetchRoles,
  } = useGetTenantRolesQuery(undefined, { skip: !advancedRolesEnabled })
  const {
    data: usersData,
    isLoading: usersLoading,
    refetch: refetchUsers,
  } = useGetTenantRoleUsersQuery(undefined, { skip: !advancedRolesEnabled })

  const [createRole] = useCreateTenantRoleMutation()
  const [updateRole] = useUpdateTenantRoleMutation()
  const [deleteRole] = useDeleteTenantRoleMutation()
  const [assignRole] = useAssignTenantUserRoleMutation()

  const roles = rolesData?.roles ?? []
  const roleUsers = usersData?.users ?? []

  const [teamSubTab, setTeamSubTab] = useState('users')
  const [expandedRoleId, setExpandedRoleId] = useState(null)
  const [roleDialog, setRoleDialog] = useState(null)
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [] })
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [ownerConfirm, setOwnerConfirm] = useState(null)
  const [driverAssign, setDriverAssign] = useState(null)

  const roleOptions = useMemo(
    () => roles.map((r) => ({ id: r.id, name: r.name, isSystem: r.is_system })),
    [roles]
  )

  const viewerRole = roles.find((r) => r.name === 'Viewer')
  const ownerRole = roles.find((r) => r.name === 'Owner')

  const openCreateRole = () => {
    setRoleForm({ name: '', description: '', permissions: [] })
    setRoleDialog({ mode: 'create' })
  }

  const openEditRole = (role) => {
    setRoleForm({
      name: role.name,
      description: role.description || '',
      permissions: role.permissions || [],
    })
    setRoleDialog({ mode: 'edit', role })
  }

  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error('Role name is required')
      return
    }
    if (roleDialog?.mode !== 'edit' && roleForm.permissions.length === 0) {
      toast.error('Select at least one permission')
      return
    }
    try {
      if (roleDialog?.mode === 'create') {
        await createRole({
          name: roleForm.name.trim(),
          description: roleForm.description,
          permissions: roleForm.permissions,
        }).unwrap()
        toast.success('Role created')
      } else if (roleDialog?.role) {
        await updateRole({
          id: roleDialog.role.id,
          name: roleForm.name.trim(),
          description: roleForm.description,
          permissions: roleDialog.role.is_system ? undefined : roleForm.permissions,
        }).unwrap()
        toast.success('Role updated')
      }
      setRoleDialog(null)
      refetchRoles()
    } catch (error) {
      toast.error(error?.data?.message || 'Failed to save role')
    }
  }

  const confirmDeleteRole = async () => {
    if (!deleteConfirm) return
    try {
      await deleteRole(deleteConfirm.id).unwrap()
      toast.success('Role deleted')
      setDeleteConfirm(null)
      refetchRoles()
    } catch (error) {
      const users = error?.data?.users
      if (users?.length) {
        setDeleteConfirm({ ...deleteConfirm, blockedUsers: users })
      } else {
        toast.error(error?.data?.message || 'Failed to delete role')
      }
    }
  }

  const handleAssignRole = async (userId, roleId, roleName) => {
    if (roleName === 'Owner') {
      setOwnerConfirm({ userId, roleId })
      return
    }
    if (roleName === 'Driver' && isSupplier) {
      setDriverAssign({ userId, roleId, driverId: '' })
      return
    }
    await doAssign(userId, roleId)
  }

  const doAssign = async (userId, roleId, { driver_id, create_driver_profile } = {}) => {
    try {
      await assignRole({
        userId,
        role_id: roleId,
        driver_id: driver_id || undefined,
        create_driver_profile,
      }).unwrap()
      toast.success('Role updated')
      refetchUsers()
      setOwnerConfirm(null)
      setDriverAssign(null)
    } catch (error) {
      toast.error(error?.data?.message || 'Failed to assign role')
    }
  }

  const usersTable = (
    <Card>
      <CardHeader>
        <CardTitle>Team members</CardTitle>
        <CardDescription>
          {advancedRolesEnabled
            ? 'Manage contacts and assign access roles.'
            : 'Manage team contacts. Access is Owner or Viewer only.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {teamMembersLoading ? (
          <div className="flex items-center justify-center py-8 text-[var(--text-muted)]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : (
          <>
            {advancedRolesEnabled && roleUsers.length > 0 && (
              <TableScroll aria-label="Team members and roles">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="bg-[var(--brand-ultra)] text-left">
                    <tr>
                      <th className="p-3 font-medium">User</th>
                      <th className="p-3 font-medium">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleUsers.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="p-3">
                          <p className="font-medium">{u.display_name || u.email}</p>
                          <p className="text-xs text-[var(--text-muted)]">{u.email}</p>
                        </td>
                        <td className="p-3">
                          <Select
                            value={u.role_id || ''}
                            onValueChange={(roleId) => {
                              const role = roles.find((r) => r.id === roleId)
                              handleAssignRole(u.id, roleId, role?.name)
                            }}
                          >
                            <SelectTrigger className="w-[200px]" placeholder="Select role">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            )}

            {teamMembers.length === 0 && !(advancedRolesEnabled && roleUsers.length > 0) ? (
              <p className="text-sm text-[var(--text-muted)] text-center py-6">
                No team contacts yet.
              </p>
            ) : !advancedRolesEnabled && teamMembers.length > 0 ? (
              <div className="space-y-3">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between border rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">{member.email}</p>
                      {!advancedRolesEnabled && (
                        <Badge variant="outline" className="mt-1 capitalize">
                          {member.role || 'viewer'}
                        </Badge>
                      )}
                    </div>
                    {onRemoveMember && (
                      <Button variant="ghost" size="sm" onClick={() => onRemoveMember(member.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {renderInviteForm?.({
              advancedRolesEnabled,
              viewerRoleId: viewerRole?.id,
              ownerRoleId: ownerRole?.id,
            })}
          </>
        )}
      </CardContent>
    </Card>
  )

  if (!advancedRolesEnabled) {
    return usersTable
  }

  return (
    <>
      <Tabs value={teamSubTab} onValueChange={setTeamSubTab}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4">
          {usersTable}
        </TabsContent>
        <TabsContent value="roles" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" />
                  Roles
                </CardTitle>
                <CardDescription>
                  System roles are locked; create custom roles as needed.
                </CardDescription>
              </div>
              <Button onClick={openCreateRole} className="w-full shrink-0 sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Role
              </Button>
            </CardHeader>
            <CardContent>
              {rolesLoading || usersLoading ? (
                <div className="flex items-center py-8 justify-center text-[var(--text-muted)]">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading roles…
                </div>
              ) : roles.length === 0 ? (
                <EmptyState
                  title="No roles yet"
                  description="Create a custom role to tailor access for your team."
                  action={
                    <Button onClick={openCreateRole}>
                      <Plus className="h-4 w-4 mr-2" />
                      New role
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-2">
                  {roles.map((role) => {
                    const expanded = expandedRoleId === role.id
                    return (
                      <div
                        key={role.id}
                        className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--surface)]"
                      >
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--brand-ultra)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30"
                          onClick={() => setExpandedRoleId(expanded ? null : role.id)}
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4 shrink-0" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{role.name}</span>
                              {role.is_system && (
                                <Lock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                              )}
                              <Badge variant="secondary">{role.user_count ?? 0} users</Badge>
                            </div>
                            <p className="text-sm text-[var(--text-muted)] truncate">
                              {role.description || permissionSummary(role.permissions)}
                            </p>
                          </div>
                          {!role.is_system && (
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm" onClick={() => openEditRole(role)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(role)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </button>
                        {expanded && (
                          <div className="px-4 pb-4 border-t">
                            <RolePermissionChecklist
                              tenantType={tenantType}
                              selected={role.permissions || []}
                              disabled
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!roleDialog} onOpenChange={() => setRoleDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{roleDialog?.mode === 'create' ? 'Create role' : 'Edit role'}</DialogTitle>
            <DialogDescription>
              {roleDialog?.role?.is_system
                ? 'Only the description can be changed for system roles.'
                : 'Choose permissions grouped by area.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={roleForm.name}
                disabled={roleDialog?.role?.is_system}
                onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            {!roleDialog?.role?.is_system && (
              <RolePermissionChecklist
                tenantType={tenantType}
                selected={roleForm.permissions}
                onChange={(permissions) => setRoleForm((f) => ({ ...f, permissions }))}
                disabled={false}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setRoleDialog(null)}
            >
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={saveRole}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete role?</DialogTitle>
            <DialogDescription>
              {deleteConfirm?.blockedUsers?.length
                ? `Cannot delete — ${deleteConfirm.blockedUsers.length} user(s) still assigned: ${deleteConfirm.blockedUsers.map((u) => u.email).join(', ')}`
                : `Remove "${deleteConfirm?.name}" permanently?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Close
            </Button>
            {!deleteConfirm?.blockedUsers?.length && (
              <Button variant="destructive" onClick={confirmDeleteRole}>
                Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ownerConfirm} onOpenChange={() => setOwnerConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Owner role?</DialogTitle>
            <DialogDescription>
              This gives full access to everything in your workspace. Only assign to people you
              trust completely.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnerConfirm(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => ownerConfirm && doAssign(ownerConfirm.userId, ownerConfirm.roleId)}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!driverAssign} onOpenChange={() => setDriverAssign(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link driver profile</DialogTitle>
            <DialogDescription>
              Drivers need a delivery profile linked to their login. Choose an existing unlinked
              profile or create one automatically.
            </DialogDescription>
          </DialogHeader>
          {unlinkedDrivers.length > 0 && (
            <div>
              <Label>Existing driver profile (optional)</Label>
              <Select
                value={driverAssign?.driverId ?? ''}
                onValueChange={(value) =>
                  setDriverAssign((prev) => (prev ? { ...prev, driverId: value } : null))
                }
              >
                <SelectTrigger className="mt-1">
                  <option value="">Create new profile for this user</option>
                  {unlinkedDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                      {d.phone ? ` · ${d.phone}` : ''}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDriverAssign(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                driverAssign &&
                doAssign(driverAssign.userId, driverAssign.roleId, {
                  driver_id: driverAssign.driverId || undefined,
                  create_driver_profile: !driverAssign.driverId,
                })
              }
            >
              Assign Driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
