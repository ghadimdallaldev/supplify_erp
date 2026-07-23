import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Phone, MapPin, FileText, RotateCcw, Unlink, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import {
  useGetBranchesQuery,
  useCreateBranchMutation,
  useDeleteBranchMutation,
  useGetEntitlementsQuery,
  useGetOrgBranchesQuery,
  useCreateOrgBranchMutation,
  useDeactivateOrgBranchMutation,
  useReactivateOrgBranchMutation,
  useUnlinkOrgBranchMutation,
  useGetOrgLinkInvitationsQuery,
  useCreateOrgLinkInvitationMutation,
  useCancelOrgLinkInvitationMutation,
  useResendOrgLinkInvitationMutation,
  useGetRestaurantOrgBranchesQuery,
  useCreateRestaurantOrgBranchMutation,
  useDeactivateRestaurantOrgBranchMutation,
  useReactivateRestaurantOrgBranchMutation,
  useUnlinkRestaurantOrgBranchMutation,
  useGetRestaurantOrgLinkInvitationsQuery,
  useCreateRestaurantOrgLinkInvitationMutation,
  useCancelRestaurantOrgLinkInvitationMutation,
  useResendRestaurantOrgLinkInvitationMutation,
} from '../services/api'
import { formatBranchGateMessage, getBranchAddGate } from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useAppDispatch, useAppSelector } from '../hooks/redux'

export function BranchAccountsPanel({ entityLabel = 'location' }: { entityLabel?: string }) {
  const { t } = useTranslation('branches')
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const isRestaurant = user?.role === 'RESTAURANT'
  const [showDialog, setShowDialog] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const { data: entitlementsData } = useGetEntitlementsQuery()

  const {
    data: orgBranchesData,
    refetch: refetchOrg,
    isLoading: orgLoading,
  } = useGetOrgBranchesQuery(undefined, { skip: !isSupplier })
  const {
    data: restaurantOrgData,
    refetch: refetchRestaurantOrg,
    isLoading: restaurantOrgLoading,
  } = useGetRestaurantOrgBranchesQuery(undefined, { skip: !isRestaurant })

  const useSupplierOrg = isSupplier && Boolean(orgBranchesData?.organizationId)
  const useRestaurantOrg = isRestaurant && Boolean(restaurantOrgData?.organizationId)
  const useOrg = useSupplierOrg || useRestaurantOrg

  const {
    data: linkedData,
    refetch: refetchLinked,
    isLoading: linkedLoading,
  } = useGetBranchesQuery(undefined, { skip: useOrg })
  const [createBranch, { isLoading: isCreatingLinked }] = useCreateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()
  const [createOrgBranch, { isLoading: isCreatingOrg }] = useCreateOrgBranchMutation()
  const [deactivateOrgBranch] = useDeactivateOrgBranchMutation()
  const [reactivateOrgBranch] = useReactivateOrgBranchMutation()
  const [unlinkOrgBranch] = useUnlinkOrgBranchMutation()
  const [createRestaurantOrgBranch, { isLoading: isCreatingRestaurantOrg }] =
    useCreateRestaurantOrgBranchMutation()
  const [deactivateRestaurantOrgBranch] = useDeactivateRestaurantOrgBranchMutation()
  const [reactivateRestaurantOrgBranch] = useReactivateRestaurantOrgBranchMutation()
  const [unlinkRestaurantOrgBranch] = useUnlinkRestaurantOrgBranchMutation()

  const { data: supplierLinkInvites, refetch: refetchSupplierInvites } =
    useGetOrgLinkInvitationsQuery(undefined, { skip: !useSupplierOrg })
  const { data: restaurantLinkInvites, refetch: refetchRestaurantInvites } =
    useGetRestaurantOrgLinkInvitationsQuery(undefined, { skip: !useRestaurantOrg })
  const [createOrgLinkInvite] = useCreateOrgLinkInvitationMutation()
  const [cancelOrgLinkInvite] = useCancelOrgLinkInvitationMutation()
  const [resendOrgLinkInvite] = useResendOrgLinkInvitationMutation()
  const [createRestaurantLinkInvite] = useCreateRestaurantOrgLinkInvitationMutation()
  const [cancelRestaurantLinkInvite] = useCancelRestaurantOrgLinkInvitationMutation()
  const [resendRestaurantLinkInvite] = useResendRestaurantOrgLinkInvitationMutation()

  const entitlements = entitlementsData?.entitlements
  const orgBranches = useSupplierOrg
    ? (orgBranchesData?.branches ?? [])
    : useRestaurantOrg
      ? (restaurantOrgData?.branches ?? [])
      : []
  const branches = useOrg
    ? orgBranches.filter((b: { is_main_branch?: boolean }) => !b.is_main_branch)
    : (linkedData?.accounts ?? []).filter((account: { isPrimary?: boolean }) => !account.isPrimary)
  const totalBranchAccounts = useOrg ? orgBranches.length || 1 : (linkedData?.accounts?.length ?? 1)
  const branchGate = getBranchAddGate(entitlements, totalBranchAccounts)
  const canAdd = branchGate.canAdd
  const isLoading = useOrg ? (useSupplierOrg ? orgLoading : restaurantOrgLoading) : linkedLoading
  const isCreating = isCreatingLinked || isCreatingOrg || isCreatingRestaurantOrg
  const linkInvitations = (
    useSupplierOrg
      ? (supplierLinkInvites?.invitations ?? [])
      : useRestaurantOrg
        ? (restaurantLinkInvites?.invitations ?? [])
        : []
  ).filter((inv: { status?: string }) => inv.status === 'pending')

  const refetch = () => {
    if (useSupplierOrg) {
      refetchOrg()
      refetchSupplierInvites()
    } else if (useRestaurantOrg) {
      refetchRestaurantOrg()
      refetchRestaurantInvites()
    } else {
      refetchLinked()
    }
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error(t('toast.nameRequired'))
      return
    }
    if (!canAdd) {
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=plan',
      })
      return
    }
    try {
      if (useSupplierOrg) {
        await createOrgBranch({
          name: form.name,
          contact_phone: form.phone || null,
          address: form.address ? { street: form.address } : null,
        }).unwrap()
      } else if (useRestaurantOrg) {
        await createRestaurantOrgBranch({
          name: form.name,
          contact_phone: form.phone || null,
          address: form.address ? { street: form.address } : null,
        }).unwrap()
      } else {
        await createBranch({
          name: form.name,
          contact_phone: form.phone || null,
          address: form.address ? { street: form.address } : null,
        }).unwrap()
      }
      setForm({ name: '', phone: '', address: '' })
      setShowDialog(false)
      refetch()
      toast.success(t('toast.created'))
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('toast.createFailed')
      toast.error(msg)
    }
  }

  const handleDeactivate = async (branchId: string) => {
    try {
      if (useSupplierOrg) {
        await deactivateOrgBranch(branchId).unwrap()
      } else if (useRestaurantOrg) {
        await deactivateRestaurantOrgBranch(branchId).unwrap()
      } else {
        await deleteBranch(branchId).unwrap()
      }
      refetch()
      toast.success(t('toast.removed'))
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('toast.removeFailed')
      toast.error(msg)
    }
  }

  const handleReactivate = async (branchId: string) => {
    try {
      if (useSupplierOrg) await reactivateOrgBranch(branchId).unwrap()
      else if (useRestaurantOrg) await reactivateRestaurantOrgBranch(branchId).unwrap()
      refetch()
      toast.success('Branch Account reactivated')
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to reactivate Branch Account'
      toast.error(msg)
    }
  }

  const handleUnlink = async (branchId: string) => {
    if (
      !window.confirm(
        'Unlink this Branch Account from the organization? It will keep its data but need its own subscription.'
      )
    ) {
      return
    }
    try {
      if (useSupplierOrg) await unlinkOrgBranch(branchId).unwrap()
      else if (useRestaurantOrg) await unlinkRestaurantOrgBranch(branchId).unwrap()
      refetch()
      toast.success('Branch Account unlinked')
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to unlink Branch Account'
      toast.error(msg)
    }
  }

  const handleInviteExisting = async () => {
    const email = linkEmail.trim()
    if (!email) {
      toast.error('Owner email is required')
      return
    }
    try {
      const result = useSupplierOrg
        ? await createOrgLinkInvite({ target_owner_email: email }).unwrap()
        : await createRestaurantLinkInvite({ target_owner_email: email }).unwrap()
      setLinkEmail('')
      setShowLinkDialog(false)
      refetch()
      toast.success(
        result.invite_url
          ? `Invitation created. Share: ${result.invite_url}`
          : 'Link invitation created'
      )
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to create link invitation'
      toast.error(msg)
    }
  }

  const handleCancelInvite = async (id: string) => {
    try {
      if (useSupplierOrg) await cancelOrgLinkInvite(id).unwrap()
      else await cancelRestaurantLinkInvite(id).unwrap()
      refetch()
      toast.success('Invitation cancelled')
    } catch {
      toast.error('Failed to cancel invitation')
    }
  }

  const handleResendInvite = async (id: string) => {
    try {
      const result = useSupplierOrg
        ? await resendOrgLinkInvite(id).unwrap()
        : await resendRestaurantLinkInvite(id).unwrap()
      toast.success(result.invite_url ? `Resent. Share: ${result.invite_url}` : 'Invitation resent')
      refetch()
    } catch {
      toast.error('Failed to resend invitation')
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Branch Accounts</CardTitle>
              <CardDescription>
                {useOrg
                  ? 'Branch Accounts under your organization. Switch between them from the header.'
                  : `Each Branch Account is a separate account with its own catalog, orders, and settings.`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {useOrg ? (
                <Button
                  variant="outline"
                  onClick={() => setShowLinkDialog(true)}
                  disabled={!canAdd}
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Invite existing
                </Button>
              ) : null}
              <Button disabled={!canAdd} onClick={() => setShowDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Branch Account
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!canAdd && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {formatBranchGateMessage(branchGate)}
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading Branch Accounts…</p>
          ) : branches.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
              <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">No extra Branch Accounts yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Add another {entityLabel} when you are ready to expand
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {branches.map((branch: Record<string, unknown>) => {
                const id = String(branch.id)
                const phone = String(branch.phone ?? branch.contact_phone ?? '')
                const address =
                  typeof branch.address === 'string'
                    ? branch.address
                    : (branch.address as { street?: string })?.street ||
                      (branch.address_json as { street?: string })?.street ||
                      ''
                const inactive = branch.is_branch_active === false
                const billingReview = Boolean(branch.billing_review_required)
                return (
                  <div
                    key={id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border rounded-lg p-4 hover:bg-[var(--brand-ultra)]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{String(branch.name)}</p>
                        {inactive ? <Badge variant="secondary">Deactivated</Badge> : null}
                        {billingReview ? <Badge variant="destructive">Billing review</Badge> : null}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-muted)] mt-1">
                        {phone ? (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 shrink-0" />
                            {phone}
                          </span>
                        ) : null}
                        {address ? (
                          <span className="flex items-center gap-1 min-w-0">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{address}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 shrink-0">
                      {useOrg && inactive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reactivate"
                          onClick={() => handleReactivate(id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {useOrg ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Unlink from organization"
                          onClick={() => handleUnlink(id)}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {!inactive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Deactivate"
                          onClick={() => handleDeactivate(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {useOrg && linkInvitations.length > 0 ? (
            <div className="mt-6 space-y-2">
              <p className="text-sm font-medium">Pending link invitations</p>
              {linkInvitations.map((inv: Record<string, unknown>) => (
                <div
                  key={String(inv.id)}
                  className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border rounded-md p-3 text-sm"
                >
                  <span className="text-[var(--text-muted)]">
                    {String(inv.target_owner_email || inv.target_tenant_id || 'Invitation')}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvite(String(inv.id))}
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvite(String(inv.id))}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Branch Account</DialogTitle>
            <DialogDescription>
              Creates an additional {entityLabel} you can switch to from the header.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="branchAccountName">Branch Account name *</Label>
              <Input
                id="branchAccountName"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="branchAccountPhone">Phone</Label>
              <Input
                id="branchAccountPhone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="branchAccountAddress">Address</Label>
              <Input
                id="branchAccountAddress"
                value={form.address}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Create Branch Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite existing account</DialogTitle>
            <DialogDescription>
              Send a link invitation to the owner email of a standalone account. Accepting attaches
              it as a Branch Account under this organization.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="linkOwnerEmail">Owner email *</Label>
            <Input
              id="linkOwnerEmail"
              type="email"
              value={linkEmail}
              onChange={(e) => setLinkEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleInviteExisting}>Send invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
