import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog'
import { FileText, Phone, MapPin, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppDispatch } from '../../../hooks/redux'
import { useAppSelector } from '../../../hooks/redux'
import {
  useGetEntitlementsQuery,
  useGetBranchesQuery,
  useGetRestaurantOrgBranchesQuery,
  useCreateBranchMutation,
  useDeleteBranchMutation,
  useDeactivateRestaurantOrgBranchMutation,
} from '../../../services/api'
import { RestaurantAddBranchModal } from '../../org/RestaurantAddBranchModal'
import { BranchAccountsPanel } from '../../BranchAccountsPanel'
import {
  formatBranchGateMessage,
  getBranchAddGate,
  multiBranchEnabled as isMultiBranchPlan,
} from '../../../lib/planLimits'
import { openBrowseUpgrade } from '../../../lib/openBrowseUpgrade'
import { OnboardingTabLoading } from './onboardingShared'

export function OnboardingBranchesTab() {
  const { t } = useTranslation('onboarding')
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const [showAddBranchDialog, setShowAddBranchDialog] = useState(false)
  const [newBranch, setNewBranch] = useState({
    name: '',
    phone: '',
    address: '',
    deliveryInstructions: '',
  })

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const multiBranchPlan = isMultiBranchPlan(entitlements)
  const { data: restaurantOrgBranches, refetch: refetchRestaurantOrgBranches } =
    useGetRestaurantOrgBranchesQuery(undefined, {
      skip: !user?.id || !multiBranchPlan,
    })
  const { data: branchesData, refetch: refetchBranches } = useGetBranchesQuery(undefined, {
    skip: !user?.id || Boolean(restaurantOrgBranches?.organizationId),
  })
  const [createBranch] = useCreateBranchMutation()
  const [deleteBranch] = useDeleteBranchMutation()
  const [deactivateOrgBranch] = useDeactivateRestaurantOrgBranchMutation()
  const useRestaurantOrg = Boolean(restaurantOrgBranches?.organizationId)
  const branches = useRestaurantOrg
    ? (restaurantOrgBranches?.branches ?? [])
    : (branchesData?.branches ?? [])
  const refetchBranchesList = useRestaurantOrg ? refetchRestaurantOrgBranches : refetchBranches
  const branchGate = getBranchAddGate(entitlements, branches.length + 1)
  const canAddBranch = branchGate.canAdd

  const handleAddBranch = async () => {
    if (!canAddBranch) {
      toast.error(formatBranchGateMessage(branchGate))
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=subscription',
      })
      return
    }
    if (!newBranch.name) {
      toast.error(t('restaurantBranches.toasts.nameRequired'))
      return
    }

    try {
      await createBranch({
        name: newBranch.name,
        contact_phone: newBranch.phone || null,
        address: newBranch.address ? { street: newBranch.address } : null,
      }).unwrap()
      setNewBranch({ name: '', phone: '', address: '', deliveryInstructions: '' })
      setShowAddBranchDialog(false)
      refetchBranches()
      toast.success(t('restaurantBranches.toasts.added'))
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('restaurantBranches.toasts.addFailed'))
    }
  }

  if (!entitlementsData && user?.id) {
    return <OnboardingTabLoading />
  }

  if (useRestaurantOrg) {
    return (
      <div className="space-y-4" data-testid="restaurant-org-branches-panel">
        <BranchAccountsPanel entityLabel="Branch Account" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('restaurantBranches.title')}</CardTitle>
                <CardDescription>{t('restaurantBranches.description')}</CardDescription>
              </div>
              <Button
                disabled={!canAddBranch}
                onClick={() => {
                  if (!canAddBranch) {
                    openBrowseUpgrade(dispatch, {
                      currentPlan: entitlements?.plan?.name ?? null,
                      upgradeUrl: '/app/settings?tab=subscription',
                    })
                    return
                  }
                  setShowAddBranchDialog(true)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('restaurantBranches.actions.addBranch')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!canAddBranch && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {formatBranchGateMessage(branchGate)}
              </div>
            )}
            {branches.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
                <p className="text-[var(--text-muted)]">{t('restaurantBranches.empty.title')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  {t('restaurantBranches.empty.description')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {branches.map((branch: any) => (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium mb-2">{branch.name}</p>
                      <div className="flex items-center gap-4 text-sm text-[var(--text-muted)]">
                        {branch.contact_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {branch.contact_phone}
                          </span>
                        )}
                        {branch.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {typeof branch.address === 'string'
                              ? branch.address
                              : branch.address?.street || JSON.stringify(branch.address)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          if (useRestaurantOrg) {
                            await deactivateOrgBranch(String(branch.id)).unwrap()
                          } else {
                            await deleteBranch(String(branch.id)).unwrap()
                          }
                          refetchBranchesList()
                          toast.success(t('restaurantBranches.toasts.removed'))
                        } catch (error: any) {
                          toast.error(
                            error?.data?.error?.message ||
                              t('restaurantBranches.toasts.removeFailed')
                          )
                        }
                      }}
                      aria-label={t('restaurantBranches.actions.removeBranch')}
                      title={t('restaurantBranches.actions.removeBranch')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!useRestaurantOrg && showAddBranchDialog} onOpenChange={setShowAddBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('restaurantBranches.dialog.title')}</DialogTitle>
            <DialogDescription>{t('restaurantBranches.dialog.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="branchName">{t('restaurantBranches.dialog.name')} *</Label>
              <Input
                id="branchName"
                placeholder={t('restaurantBranches.dialog.namePlaceholder')}
                value={newBranch.name}
                onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchPhone">{t('restaurantBranches.dialog.phone')}</Label>
              <Input
                id="branchPhone"
                placeholder={t('restaurantBranches.dialog.phonePlaceholder')}
                value={newBranch.phone}
                onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchAddress">{t('restaurantBranches.dialog.address')}</Label>
              <Input
                id="branchAddress"
                placeholder={t('restaurantBranches.dialog.addressPlaceholder')}
                value={newBranch.address}
                onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="branchDeliveryInstructions">
                {t('restaurantBranches.dialog.deliveryInstructions')}
              </Label>
              <Textarea
                id="branchDeliveryInstructions"
                placeholder={t('restaurantBranches.dialog.deliveryInstructionsPlaceholder')}
                rows={3}
                value={newBranch.deliveryInstructions}
                onChange={(e) =>
                  setNewBranch({ ...newBranch, deliveryInstructions: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBranchDialog(false)}>
              {t('restaurantBranches.actions.cancel')}
            </Button>
            <Button onClick={handleAddBranch}>{t('restaurantBranches.actions.addBranch')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {useRestaurantOrg ? (
        <RestaurantAddBranchModal
          open={showAddBranchDialog}
          onClose={() => {
            setShowAddBranchDialog(false)
            refetchBranchesList()
          }}
        />
      ) : null}
    </>
  )
}
