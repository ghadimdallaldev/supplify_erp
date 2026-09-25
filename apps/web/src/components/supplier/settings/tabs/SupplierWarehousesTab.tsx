import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Badge } from '../../../ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../ui/sheet'
import { Warehouse, MapPin, Loader2, MapPinned, Pencil } from 'lucide-react'
import { WarehouseZonesPanel } from '../WarehouseZonesPanel'
import { toast } from 'sonner'
import { WarehouseFulfillmentSettings } from '../../../settings/WarehouseFulfillmentSettings'
import { useAppDispatch, useAppSelector } from '../../../../hooks/redux'
import { usePermissions } from '../../../../hooks/usePermissions'
import {
  getWarehouseAddGate,
  formatWarehouseGateMessage,
  warehousesFeatureEnabled,
  multiWarehousePlanEnabled,
} from '../../../../lib/planLimits'
import { openBrowseUpgrade } from '../../../../lib/openBrowseUpgrade'
import { formatAddressLine } from '../../../../lib/address'
import {
  useGetEntitlementsQuery,
  useGetWarehousesQuery,
  useCreateWarehouseMutation,
  useSetDefaultWarehouseMutation,
  useUpdateWarehouseMutation,
  useGetSupplierFulfillmentQuery,
} from '../../../../services/api'
import { ensureNamespace } from '../../../../i18n'

export function SupplierWarehousesTab() {
  const { t } = useTranslation('suppliers')
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { can, canAny } = usePermissions()
  const canWriteWarehouses = canAny('WAREHOUSES_EDIT', 'WAREHOUSES_MANAGE')
  const canCreateWarehouse = can('WAREHOUSES_MANAGE')
  const canDeactivateWarehouse = can('WAREHOUSES_MANAGE')
  const canManageZones = canAny('WAREHOUSES_MANAGE')
  const canManageFulfillment = can('SETTINGS_MANAGE')

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const warehousesEnabled = warehousesFeatureEnabled(entitlements)
  const multiWarehousePlan = multiWarehousePlanEnabled(entitlements)

  const { data: warehousesData, refetch: refetchWarehouses } = useGetWarehousesQuery(undefined, {
    skip: !warehousesEnabled || !can('WAREHOUSES_VIEW'),
  })
  useGetSupplierFulfillmentQuery(undefined, {
    skip: !multiWarehousePlan || !canManageFulfillment,
  })
  const [createWarehouse, { isLoading: isCreatingWarehouse }] = useCreateWarehouseMutation()
  const [setDefaultWarehouse, { isLoading: isSettingDefault }] = useSetDefaultWarehouseMutation()
  const [updateWarehouse, { isLoading: isUpdatingWarehouse }] = useUpdateWarehouseMutation()

  const warehouseCount = warehousesData?.warehouses?.length ?? 0
  const warehouseGate = getWarehouseAddGate(entitlements, warehouseCount)
  const canAddWarehouse = warehouseGate.canAdd

  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null)
  const [zonesWarehouse, setZonesWarehouse] = useState<{ id: string; name: string } | null>(null)
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    isMain: false,
  })

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  const handleAddWarehouse = async () => {
    if (!canAddWarehouse) {
      toast.error(t('warehouses.toast.planLimit'))
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=plan',
      })
      return
    }
    if (!warehouseForm.name.trim()) {
      toast.error(t('warehouses.toast.nameRequired'))
      return
    }
    try {
      const address = [warehouseForm.address, warehouseForm.city, warehouseForm.country]
        .filter(Boolean)
        .join(', ')
      const created = await createWarehouse({
        name: warehouseForm.name,
        code: warehouseForm.code || undefined,
        address: address || undefined,
      }).unwrap()
      if (warehouseForm.isMain && created?.warehouse?.id && !created.warehouse.is_default) {
        await setDefaultWarehouse(created.warehouse.id).unwrap()
      }
      toast.success(t('warehouses.toast.added'))
      await refetchWarehouses()
      setShowAddWarehouse(false)
      setWarehouseForm({ name: '', code: '', address: '', city: '', country: '', isMain: false })
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('warehouses.toast.addFailed'))
    }
  }

  const resetWarehouseForm = () => {
    setWarehouseForm({ name: '', code: '', address: '', city: '', country: '', isMain: false })
    setEditingWarehouseId(null)
    setShowAddWarehouse(false)
  }

  const openEditWarehouse = (wh: {
    id: string
    name?: string
    code?: string
    address?: unknown
  }) => {
    setEditingWarehouseId(wh.id)
    setWarehouseForm({
      name: wh.name || '',
      code: wh.code || '',
      address: formatAddressLine(wh.address) || (typeof wh.address === 'string' ? wh.address : ''),
      city: '',
      country: '',
      isMain: false,
    })
    setShowAddWarehouse(true)
  }

  const handleSaveWarehouse = async () => {
    if (editingWarehouseId) {
      if (!warehouseForm.name.trim()) {
        toast.error(t('warehouses.toast.nameRequired'))
        return
      }
      try {
        const address = [warehouseForm.address, warehouseForm.city, warehouseForm.country]
          .filter(Boolean)
          .join(', ')
        await updateWarehouse({
          id: editingWarehouseId,
          name: warehouseForm.name,
          code: warehouseForm.code || undefined,
          address: address || undefined,
        }).unwrap()
        toast.success(t('warehouses.toast.updated'))
        await refetchWarehouses()
        resetWarehouseForm()
      } catch (err: any) {
        toast.error(err?.data?.error?.message || t('warehouses.toast.updateFailed'))
      }
      return
    }
    await handleAddWarehouse()
  }

  const handleDeactivateWarehouse = async (warehouseId: string) => {
    if (!canDeactivateWarehouse) {
      toast.error(t('warehouses.toast.noPermission'))
      return
    }
    try {
      await updateWarehouse({ id: warehouseId, is_active: false }).unwrap()
      toast.success(t('warehouses.toast.deactivated'))
      await refetchWarehouses()
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('warehouses.toast.deactivateFailed'))
    }
  }

  const handleSetDefault = async (warehouseId: string) => {
    if (!canWriteWarehouses) {
      toast.error(t('warehouses.toast.noPermission'))
      return
    }
    try {
      await setDefaultWarehouse(warehouseId).unwrap()
      toast.success(t('warehouses.toast.added'))
      await refetchWarehouses()
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('warehouses.toast.addFailed'))
    }
  }

  if (!warehousesEnabled) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-[var(--text-muted)] mb-3">{t('warehouses.upgradeRequired')}</p>
            <Button
              variant="outline"
              onClick={() =>
                openBrowseUpgrade(dispatch, {
                  currentPlan: entitlements?.plan?.name ?? null,
                  upgradeUrl: '/app/settings?tab=plan',
                })
              }
            >
              {t('warehouses.viewPlans')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {multiWarehousePlan && <WarehouseFulfillmentSettings enabled={multiWarehousePlan} />}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="h-5 w-5" />
                {t('warehouses.title')}
              </CardTitle>
              <CardDescription>{t('warehouses.description')}</CardDescription>
            </div>
            <Button
              disabled={!canAddWarehouse || !canCreateWarehouse}
              onClick={() => {
                if (!canCreateWarehouse) {
                  toast.error(t('warehouses.toast.noPermission'))
                  return
                }
                if (!canAddWarehouse) {
                  openBrowseUpgrade(dispatch, {
                    currentPlan: entitlements?.plan?.name ?? null,
                    upgradeUrl: '/app/settings?tab=plan',
                  })
                  return
                }
                setShowAddWarehouse(true)
              }}
            >
              <Warehouse className="h-4 w-4 mr-2" />
              {t('warehouses.addWarehouse')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!canAddWarehouse && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {formatWarehouseGateMessage(warehouseGate)}
            </div>
          )}
          <div className="space-y-3">
            {(warehousesData?.warehouses ?? []).length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[var(--app-border-mid)] rounded-lg">
                <Warehouse className="h-12 w-12 mx-auto text-[var(--text-muted)] mb-2" />
                <p className="text-[var(--text-muted)]">{t('warehouses.noWarehouses')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {t('warehouses.noWarehousesHint')}
                </p>
              </div>
            ) : (
              (warehousesData?.warehouses ?? []).map((wh: any) => (
                <div
                  key={wh.id}
                  className="border rounded-lg p-4 hover:bg-[var(--brand-ultra)] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{wh.name}</h4>
                        {wh.code && <Badge variant="outline">{wh.code}</Badge>}
                        {(wh.is_default || wh.is_main) && (
                          <Badge variant="secondary">{t('warehouses.default')}</Badge>
                        )}
                        {wh.is_active === false && (
                          <Badge variant="outline">{t('warehouses.inactive')}</Badge>
                        )}
                      </div>
                      {formatAddressLine(wh.address) && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                          <MapPin className="h-4 w-4" />
                          <span>{formatAddressLine(wh.address)}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!(wh.is_default || wh.is_main) &&
                        canWriteWarehouses &&
                        wh.is_active !== false && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isSettingDefault}
                            onClick={() => handleSetDefault(wh.id)}
                          >
                            {t('warehouses.default')}
                          </Button>
                        )}
                      {canWriteWarehouses && (
                        <Button variant="outline" size="sm" onClick={() => openEditWarehouse(wh)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t('warehouses.editWarehouse')}
                        </Button>
                      )}
                      {canDeactivateWarehouse && wh.is_active !== false && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isUpdatingWarehouse}
                          onClick={() => handleDeactivateWarehouse(wh.id)}
                        >
                          {t('warehouses.deactivateWarehouse')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZonesWarehouse({ id: wh.id, name: wh.name })}
                      >
                        <MapPinned className="h-4 w-4 mr-2" />
                        {t('warehouses.manageZones')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Sheet
        open={zonesWarehouse !== null}
        onOpenChange={(open) => {
          if (!open) setZonesWarehouse(null)
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 overflow-hidden sm:max-w-lg"
        >
          <SheetHeader className="shrink-0 text-left">
            <SheetTitle>{t('warehouses.sheetTitle')}</SheetTitle>
            <SheetDescription>
              {zonesWarehouse
                ? t('warehouses.sheetDescriptionWarehouse', { name: zonesWarehouse.name })
                : t('warehouses.sheetDescriptionDefault')}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {zonesWarehouse && (
              <WarehouseZonesPanel warehouseId={zonesWarehouse.id} canWrite={canManageZones} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={showAddWarehouse}
        onOpenChange={(open) => {
          if (!open) resetWarehouseForm()
          else setShowAddWarehouse(true)
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>
              {editingWarehouseId
                ? t('warehouses.addDialog.editTitle')
                : t('warehouses.addDialog.title')}
            </DialogTitle>
            <DialogDescription>
              {editingWarehouseId
                ? t('warehouses.addDialog.editDescription')
                : t('warehouses.addDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="warehouse-name">{t('warehouses.addDialog.name')}</Label>
                <Input
                  id="warehouse-name"
                  placeholder={t('warehouses.addDialog.namePlaceholder')}
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-code">{t('warehouses.addDialog.code')}</Label>
                <Input
                  id="warehouse-code"
                  placeholder={t('warehouses.addDialog.codePlaceholder')}
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="warehouse-address">{t('warehouses.addDialog.address')}</Label>
                <Input
                  id="warehouse-address"
                  placeholder={t('warehouses.addDialog.addressPlaceholder')}
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-city">{t('warehouses.addDialog.city')}</Label>
                <Input
                  id="warehouse-city"
                  placeholder={t('warehouses.addDialog.cityPlaceholder')}
                  value={warehouseForm.city}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-country">{t('warehouses.addDialog.country')}</Label>
                <Input
                  id="warehouse-country"
                  placeholder={t('warehouses.addDialog.countryPlaceholder')}
                  value={warehouseForm.country}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, country: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2 md:col-span-2">
                {!editingWarehouseId && (
                  <>
                    <input
                      type="checkbox"
                      id="isMain"
                      checked={warehouseForm.isMain}
                      onChange={(e) =>
                        setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })
                      }
                      className="rounded"
                    />
                    <Label htmlFor="isMain" className="text-sm font-medium">
                      {t('warehouses.addDialog.setMain')}
                    </Label>
                  </>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetWarehouseForm}>
              {t('warehouses.addDialog.cancel')}
            </Button>
            <Button
              onClick={() => void handleSaveWarehouse()}
              disabled={isCreatingWarehouse || isUpdatingWarehouse}
            >
              {isCreatingWarehouse || isUpdatingWarehouse ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingWarehouseId ? t('warehouses.addDialog.save') : t('warehouses.addWarehouse')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
