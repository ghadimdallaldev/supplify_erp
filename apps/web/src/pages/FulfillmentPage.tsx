import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ClipboardList, MapPin, Navigation, Truck, Warehouse } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  useGetFulfillmentExceptionsQuery,
  useGetWarehousesQuery,
  useGetSupplierFulfillmentQuery,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { isMultiWarehouseActive } from '../lib/planLimits'
import { RequirePermission } from '../components/RequirePermission'
import { usePermissions } from '../hooks/usePermissions'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { StatusBadge } from '../components/ui/status-badge'
import { Label } from '../components/ui/label'
import { Select, SelectTrigger } from '../components/ui/select'
import { LazyTabMount } from '../components/LazyTabMount'
import {
  LazyFulfillmentDispatchPanel,
  LazyFulfillmentExceptionsTab,
  LazyFulfillmentPickListsTab,
  LazyFulfillmentRoutesTab,
  LazyFulfillmentTrackingTab,
} from '../components/fulfillment/lazyFulfillmentTabs'
import { ensureNamespace } from '../i18n'

export function FulfillmentPage() {
  const { t } = useTranslation('fulfillment')
  const { can } = usePermissions()
  const canViewWarehouses = can('WAREHOUSES_VIEW')
  const [activeTab, setActiveTab] = useState('dispatch')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  useEffect(() => {
    void ensureNamespace('fulfillment')
  }, [])

  const { entitlements } = useEntitlements()
  const { data: warehousesData } = useGetWarehousesQuery(undefined, {
    skip: !canViewWarehouses,
  })
  const { data: fulfillmentData } = useGetSupplierFulfillmentQuery()

  const warehouses = warehousesData?.warehouses ?? []
  const multiWarehouseActive = isMultiWarehouseActive(entitlements, fulfillmentData?.fulfillment)
  const warehouseFilter =
    multiWarehouseActive && selectedWarehouseId ? { warehouseId: selectedWarehouseId } : undefined
  const warehouseId = warehouseFilter?.warehouseId

  const { data: exceptionsResponse } = useGetFulfillmentExceptionsQuery(warehouseFilter, {
    skip: activeTab !== 'exceptions',
  })

  return (
    <RequirePermission permission="FULFILLMENT_VIEW" title={t('page.permissionTitle')}>
      <PageShell maxWidth="wide" className="overflow-x-hidden" data-testid="fulfillment-page">
        <PageHeader title={t('page.title')} description={t('page.description')} />

        {multiWarehouseActive && warehouses.length > 0 && (
          <div className="flex max-w-sm items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2">
            <Warehouse className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <Label htmlFor="fulfillment-warehouse" className="sr-only">
                {t('page.warehouseFilter')}
              </Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger
                  id="fulfillment-warehouse"
                  className="h-8 border-0 bg-transparent px-0 shadow-none focus:ring-0"
                >
                  <option value="">{t('page.allWarehouses')}</option>
                  {warehouses.map((wh: { id: string; name: string }) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="h-auto w-full gap-1 sm:flex sm:flex-wrap">
            <TabsTrigger value="dispatch" className="gap-1.5 text-xs sm:text-sm">
              <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.dispatch')}
            </TabsTrigger>
            <TabsTrigger value="picklists" className="gap-1.5 text-xs sm:text-sm">
              <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.picklists')}
            </TabsTrigger>
            <TabsTrigger value="routes" className="gap-1.5 text-xs sm:text-sm">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.routes')}
            </TabsTrigger>
            <TabsTrigger value="tracking" className="gap-1.5 text-xs sm:text-sm">
              <Navigation className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.tracking')}
            </TabsTrigger>
            <TabsTrigger value="exceptions" className="relative gap-1.5 text-xs sm:text-sm">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {t('page.tabs.exceptions')}
              {(exceptionsResponse?.openCount ?? 0) > 0 && (
                <StatusBadge
                  status="OVERDUE"
                  label={String(exceptionsResponse?.openCount)}
                  showDot={false}
                  className="ml-0.5 min-h-5 min-w-[1.25rem] justify-center rounded-full px-1 py-0 text-[10px] leading-none"
                />
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch" className="mt-4 space-y-4">
            <LazyTabMount tab="dispatch" selectedTab={activeTab}>
              <LazyFulfillmentDispatchPanel warehouseId={warehouseId} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="picklists" className="mt-4 space-y-4">
            <LazyTabMount tab="picklists" selectedTab={activeTab}>
              <LazyFulfillmentPickListsTab warehouseId={warehouseId} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="routes" className="mt-4 space-y-4">
            <LazyTabMount tab="routes" selectedTab={activeTab}>
              <LazyFulfillmentRoutesTab warehouseId={warehouseId} />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="tracking" className="mt-4 space-y-4">
            <LazyTabMount tab="tracking" selectedTab={activeTab}>
              <LazyFulfillmentTrackingTab />
            </LazyTabMount>
          </TabsContent>

          <TabsContent value="exceptions" className="mt-4 space-y-4">
            <LazyTabMount tab="exceptions" selectedTab={activeTab}>
              <LazyFulfillmentExceptionsTab warehouseId={warehouseId} />
            </LazyTabMount>
          </TabsContent>
        </Tabs>
      </PageShell>
    </RequirePermission>
  )
}
