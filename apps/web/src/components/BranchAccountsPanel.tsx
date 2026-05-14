import { useState } from 'react'
import { Plus, Trash2, Phone, MapPin, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
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
} from '../services/api'
import { canAddBranches } from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { useAppDispatch } from '../hooks/redux'

export function BranchAccountsPanel({ entityLabel = 'location' }: { entityLabel?: string }) {
  const dispatch = useAppDispatch()
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', address: '' })
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const { data, refetch, isLoading } = useGetBranchesQuery()
  const [createBranch, { isLoading: isCreating }] = useCreateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()

  const entitlements = entitlementsData?.entitlements
  const linked = (data?.accounts ?? []).filter((account: any) => !account.isPrimary)
  const canAdd = canAddBranches(entitlements, linked.length)

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Branch name is required')
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
      await createBranch({
        name: form.name,
        contact_phone: form.phone || null,
        address: form.address ? { street: form.address } : null,
      }).unwrap()
      setForm({ name: '', phone: '', address: '' })
      setShowDialog(false)
      refetch()
      toast.success('Branch account created')
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to create branch account')
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Branch accounts</CardTitle>
              <CardDescription>
                Each branch is a separate account with its own catalog, orders, and settings. Switch
                between them from the header.
              </CardDescription>
            </div>
            <Button disabled={!canAdd} onClick={() => setShowDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add branch account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!canAdd && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Branch accounts require a paid plan (Gold or higher). Free tier includes one account
              only.
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading branch accounts…</p>
          ) : linked.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No branch accounts yet</p>
              <p className="text-sm text-gray-500 mt-2">
                Create a separate account for each additional {entityLabel}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {linked.map((branch: any) => (
                <div
                  key={branch.id}
                  className="flex items-center justify-between border rounded-lg p-4 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-1">
                      {branch.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {branch.phone}
                        </span>
                      )}
                      {branch.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {typeof branch.address === 'string'
                            ? branch.address
                            : branch.address?.street}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await deleteBranch(branch.id).unwrap()
                        refetch()
                        toast.success('Branch account unlinked')
                      } catch (error: any) {
                        toast.error(error?.data?.error?.message || 'Failed to remove branch account')
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New branch account</DialogTitle>
            <DialogDescription>
              This creates a separate account under your organization. You can switch to it from the
              header.
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
              {isCreating ? 'Creating…' : 'Create account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
