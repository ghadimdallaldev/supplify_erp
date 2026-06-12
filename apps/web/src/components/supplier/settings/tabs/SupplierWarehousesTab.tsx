import { useState } from 'react'
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
import { Warehouse, MapPin, Loader2 } from 'lucide-react'
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
  useGetSupplierFulfillmentQuery,
} from '../../../../services/api'

export function SupplierWarehousesTab() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { canAny } = usePermissions()
  const canWriteWarehouses = canAny('WAREHOUSES_EDIT', 'WAREHOUSES_MANAGE')

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const warehousesEnabled = warehousesFeatureEnabled(entitlements)
  const multiWarehousePlan = multiWarehousePlanEnabled(entitlements)

  const { data: warehousesData, refetch: refetchWarehouses } = useGetWarehousesQuery(undefined, {
    skip: !warehousesEnabled,
  })
  useGetSupplierFulfillmentQuery(undefined, { skip: !multiWarehousePlan })
  const [createWarehouse, { isLoading: isCreatingWarehouse }] = useCreateWarehouseMutation()

  const warehouseCount = warehousesData?.warehouses?.length ?? 0
  const warehouseGate = getWarehouseAddGate(entitlements, warehouseCount)
  const canAddWarehouse = warehouseGate.canAdd

  const [showAddWarehouse, setShowAddWarehouse] = useState(false)
  const [warehouseForm, setWarehouseForm] = useState({
    name: '',
    code: '',
    address: '',
    city: '',
    country: '',
    isMain: false,
  })

  const handleAddWarehouse = async () => {
    if (!canAddWarehouse) {
      toast.error(
        'Additional warehouses are not included on your current plan. Upgrade to add more.'
      )
      openBrowseUpgrade(dispatch, {
        currentPlan: entitlements?.plan?.name ?? null,
        upgradeUrl: '/app/settings?tab=plan',
      })
      return
    }
    if (!warehouseForm.name.trim()) {
      toast.error('Warehouse name is required')
      return
    }
    try {
      const address = [warehouseForm.address, warehouseForm.city, warehouseForm.country]
        .filter(Boolean)
        .join(', ')
      await createWarehouse({
        name: warehouseForm.name,
        code: warehouseForm.code || undefined,
        address: address || undefined,
      }).unwrap()
      toast.success('Warehouse added successfully!')
      await refetchWarehouses()
      setShowAddWarehouse(false)
      setWarehouseForm({ name: '', code: '', address: '', city: '', country: '', isMain: false })
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to add warehouse')
    }
  }

  if (!warehousesEnabled) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-[var(--text-muted)] mb-3">
              Warehouse management requires Silver or higher. Free accounts do not include warehouse
              locations; any legacy default warehouse from older data is not usable until you
              upgrade.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                openBrowseUpgrade(dispatch, {
                  currentPlan: entitlements?.plan?.name ?? null,
                  upgradeUrl: '/app/settings?tab=plan',
                })
              }
            >
              View plans
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
                Warehouses
              </CardTitle>
              <CardDescription>Manage your warehouse locations</CardDescription>
            </div>
            <Button
              disabled={!canAddWarehouse || !canWriteWarehouses}
              onClick={() => {
                if (!canWriteWarehouses) {
                  toast.error('You do not have permission to manage warehouses')
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
              Add Warehouse
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
                <p className="text-[var(--text-muted)]">No warehouses yet</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Add a warehouse to manage multiple locations
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
                          <Badge variant="secondary">Default</Badge>
                        )}
                      </div>
                      {formatAddressLine(wh.address) && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                          <MapPin className="h-4 w-4" />
                          <span>{formatAddressLine(wh.address)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddWarehouse} onOpenChange={setShowAddWarehouse}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Warehouse</DialogTitle>
            <DialogDescription>Create a new warehouse location for your business</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="warehouse-name">Warehouse Name *</Label>
                <Input
                  id="warehouse-name"
                  placeholder="Main Warehouse"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-code">Warehouse Code *</Label>
                <Input
                  id="warehouse-code"
                  placeholder="WH-001"
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="warehouse-address">Street Address</Label>
                <Input
                  id="warehouse-address"
                  placeholder="123 Farm Road"
                  value={warehouseForm.address}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-city">City</Label>
                <Input
                  id="warehouse-city"
                  placeholder="Agricultural City"
                  value={warehouseForm.city}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, city: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="warehouse-country">Country</Label>
                <Input
                  id="warehouse-country"
                  placeholder="USA"
                  value={warehouseForm.country}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, country: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2 md:col-span-2">
                <input
                  type="checkbox"
                  id="isMain"
                  checked={warehouseForm.isMain}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, isMain: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="isMain" className="text-sm font-medium">
                  Set as main warehouse
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWarehouse(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWarehouse} disabled={isCreatingWarehouse}>
              {isCreatingWarehouse ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Warehouse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
