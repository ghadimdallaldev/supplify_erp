import { useState } from 'react'
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

export function FulfillmentPage() {
  const { can } = usePermissions()
  const canViewWarehouses = can('WAREHOUSES_VIEW')
  const [activeTab, setActiveTab] = useState('dispatch')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

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
    <RequirePermission permission="FULFILLMENT_VIEW" title="fulfillment">
      <PageShell maxWidth="full" className="overflow-x-hidden">
        <PageHeader
          title="Fulfillment & logistics"
          description="Pick lists, driver dispatch, routes, and delivery tracking."
        />

        {multiWarehouseActive && warehouses.length > 0 && (
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="fulfillment-warehouse">Warehouse filter</Label>
              <Select value={selectedWarehouseId} onValueChange={setSelectedWarehouseId}>
                <SelectTrigger id="fulfillment-warehouse" className="mt-1.5">
                  <option value="">All warehouses</option>
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
            <TabsTrigger value="dispatch" className="text-xs sm:text-sm">
              Driver Dispatch
            </TabsTrigger>
            <TabsTrigger value="picklists" className="text-xs sm:text-sm">
              Pick Lists
            </TabsTrigger>
            <TabsTrigger value="routes" className="text-xs sm:text-sm">
              Routes
            </TabsTrigger>
            <TabsTrigger value="tracking" className="text-xs sm:text-sm">
              Delivery Tracking
            </TabsTrigger>
            <TabsTrigger value="exceptions" className="relative text-xs sm:text-sm">
              Exceptions
              {(exceptionsResponse?.openCount ?? 0) > 0 && (
                <StatusBadge
                  status="OVERDUE"
                  label={String(exceptionsResponse?.openCount)}
                  showDot={false}
                  className="ml-1 min-h-5 min-w-[1.25rem] justify-center rounded-full px-1 py-0 text-[10px] leading-none"
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
              <LazyFulfillmentPickListsTab />
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
