import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Badge } from '../../../ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../../../ui/sheet'
import { MapPinned, MapPin, Loader2, Warehouse } from 'lucide-react'
import { WarehouseZonesPanel } from '../WarehouseZonesPanel'
import { useAppDispatch, useAppSelector } from '../../../../hooks/redux'
import { usePermissions } from '../../../../hooks/usePermissions'
import { warehousesFeatureEnabled } from '../../../../lib/planLimits'
import { openBrowseUpgrade } from '../../../../lib/openBrowseUpgrade'
import { formatAddressLine } from '../../../../lib/address'
import { useGetEntitlementsQuery, useGetWarehousesQuery } from '../../../../services/api'
import { useListZonesQuery } from '../../../../services/api/endpoints/warehouses'
import { ensureNamespace } from '../../../../i18n'

function WarehouseZoneCount({ warehouseId }: { warehouseId: string }) {
  const { t } = useTranslation('suppliers')
  const { data, isLoading, isError } = useListZonesQuery(warehouseId)

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('deliveryZones.loading')}
      </span>
    )
  }

  if (isError) {
    return <span className="text-sm text-[var(--text-muted)]">—</span>
  }

  const count = data?.zones?.length ?? 0
  return (
    <Badge variant={count > 0 ? 'secondary' : 'outline'}>
      {count} {t('deliveryZones.zone', { count })}
    </Badge>
  )
}

export function SupplierDeliveryZonesTab() {
  const { t } = useTranslation('suppliers')
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { canAny } = usePermissions()
  const canManageZones = canAny('WAREHOUSES_MANAGE')

  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const warehousesEnabled = warehousesFeatureEnabled(entitlements)

  const { data: warehousesData, isLoading: isLoadingWarehouses } = useGetWarehousesQuery(
    undefined,
    { skip: !warehousesEnabled }
  )

  const [zonesWarehouse, setZonesWarehouse] = useState<{ id: string; name: string } | null>(null)

  const warehouses = warehousesData?.warehouses ?? []

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  if (!warehousesEnabled) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="mb-3 text-[var(--text-muted)]">{t('deliveryZones.upgradeRequired')}</p>
            <Button
              variant="outline"
              onClick={() =>
                openBrowseUpgrade(dispatch, {
                  currentPlan: entitlements?.plan?.name ?? null,
                  upgradeUrl: '/app/settings?tab=plan',
                })
              }
            >
              {t('deliveryZones.viewPlans')}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="h-5 w-5" />
            {t('deliveryZones.title')}
          </CardTitle>
          <CardDescription>{t('deliveryZones.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingWarehouses ? (
            <div className="flex justify-center py-12 text-[var(--text-muted)]">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : warehouses.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-[var(--app-border-mid)] py-12 text-center">
              <Warehouse className="mx-auto mb-2 h-12 w-12 text-[var(--text-muted)]" />
              <p className="text-[var(--text-muted)]">{t('deliveryZones.noWarehouses')}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t('deliveryZones.noWarehousesHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {warehouses.map(
                (wh: { id: string; name: string; code?: string; address?: string }) => (
                  <div
                    key={wh.id}
                    className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors hover:bg-[var(--brand-ultra)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold">{wh.name}</h4>
                        {wh.code && <Badge variant="outline">{wh.code}</Badge>}
                        <WarehouseZoneCount warehouseId={wh.id} />
                      </div>
                      {formatAddressLine(wh.address) && (
                        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span className="truncate">{formatAddressLine(wh.address)}</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setZonesWarehouse({ id: wh.id, name: wh.name })}
                    >
                      <MapPinned className="mr-2 h-4 w-4" />
                      {t('deliveryZones.manageZones')}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
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
            <SheetTitle>{t('deliveryZones.sheetTitle')}</SheetTitle>
            <SheetDescription>
              {zonesWarehouse
                ? t('deliveryZones.sheetDescriptionWarehouse', { name: zonesWarehouse.name })
                : t('deliveryZones.sheetDescriptionDefault')}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {zonesWarehouse && (
              <WarehouseZonesPanel warehouseId={zonesWarehouse.id} canWrite={canManageZones} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
