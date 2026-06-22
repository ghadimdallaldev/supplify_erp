import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Phone, MapPin, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
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
} from '../services/api'
import { formatBranchGateMessage, getBranchAddGate } from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useAppDispatch, useAppSelector } from '../hooks/redux'

export function BranchAccountsPanel({ entityLabel = 'location' }: { entityLabel?: string }) {
  const { t } = useTranslation('branches')
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const isSupplier = user?.role === 'SUPPLIER'
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const { data: entitlementsData } = useGetEntitlementsQuery()

  const {
    data: orgBranchesData,
    refetch: refetchOrg,
    isLoading: orgLoading,
  } = useGetOrgBranchesQuery(undefined, { skip: !isSupplier })
  const useSupplierOrg = isSupplier && Boolean(orgBranchesData?.organizationId)

  const {
    data: linkedData,
    refetch: refetchLinked,
    isLoading: linkedLoading,
  } = useGetBranchesQuery(undefined, { skip: useSupplierOrg })
  const [createBranch, { isLoading: isCreatingLinked }] = useCreateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()
  const [createOrgBranch, { isLoading: isCreatingOrg }] = useCreateOrgBranchMutation()
  const [deactivateOrgBranch] = useDeactivateOrgBranchMutation()

  const entitlements = entitlementsData?.entitlements
  const branches = useSupplierOrg
    ? (orgBranchesData?.branches ?? []).filter(
        (b: { is_main_branch?: boolean }) => !b.is_main_branch
      )
    : (linkedData?.accounts ?? []).filter((account: { isPrimary?: boolean }) => !account.isPrimary)
  const totalBranchAccounts = useSupplierOrg
    ? (orgBranchesData?.branches?.length ?? 1)
    : (linkedData?.accounts?.length ?? 1)
  const branchGate = getBranchAddGate(entitlements, totalBranchAccounts)
  const canAdd = branchGate.canAdd
  const isLoading = useSupplierOrg ? orgLoading : linkedLoading
  const isCreating = isCreatingLinked || isCreatingOrg

  const refetch = () => {
    if (useSupplierOrg) refetchOrg()
    else refetchLinked()
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

  const handleRemove = async (branchId: string) => {
    try {
      if (useSupplierOrg) {
        await deactivateOrgBranch(branchId).unwrap()
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Branch accounts</CardTitle>
              <CardDescription>
                {useSupplierOrg
                  ? 'Locations under your supplier organization. Switch between them from the header.'
                  : `Each branch is a separate account with its own catalog, orders, and settings. Switch between them from the header.`}
              </CardDescription>
            </div>
            <Button disabled={!canAdd} onClick={() => setShowDialog(true)} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Add branch
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!canAdd && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {formatBranchGateMessage(branchGate)}
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading branch accounts…</p>
          ) : branches.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
              <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">No extra branches yet</p>
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
                return (
                  <div
                    key={id}
                    className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border rounded-lg p-4 hover:bg-[var(--brand-ultra)]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{String(branch.name)}</p>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleRemove(id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New branch</DialogTitle>
            <DialogDescription>
              Creates an additional {entityLabel} you can switch to from the header.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="branchAccountName">Branch name *</Label>
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
              {isCreating ? 'Creating…' : 'Create branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
