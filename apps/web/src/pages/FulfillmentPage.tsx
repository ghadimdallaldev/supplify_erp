import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import {
  useGetFulfillmentExceptionsQuery,
  useGetWarehousesQuery,
  useGetSupplierFulfillmentQuery,
} from '../services/api'
import { useEntitlements } from '../hooks/useEntitlements'
import { isMultiWarehouseActive } from '../lib/planLimits'
import { FulfillmentDispatchPanel } from '../components/fulfillment/FulfillmentDispatchPanel'
import { FulfillmentPickListsTab } from '../components/fulfillment/FulfillmentPickListsTab'
import { FulfillmentRoutesTab } from '../components/fulfillment/FulfillmentRoutesTab'
import { FulfillmentTrackingTab } from '../components/fulfillment/FulfillmentTrackingTab'
import { FulfillmentExceptionsTab } from '../components/fulfillment/FulfillmentExceptionsTab'
import { RequirePermission } from '../components/RequirePermission'
import { PageHeader } from '../components/ui/page-header'
import { Label } from '../components/ui/label'

export function FulfillmentPage() {
  const [activeTab, setActiveTab] = useState('dispatch')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')

  const { entitlements } = useEntitlements()
  const { data: warehousesData } = useGetWarehousesQuery()
  const { data: fulfillmentData } = useGetSupplierFulfillmentQuery()

  const warehouses = warehousesData?.warehouses ?? []
  const multiWarehouseActive = isMultiWarehouseActive(entitlements, fulfillmentData?.fulfillment)
  const warehouseFilter =
    multiWarehouseActive && selectedWarehouseId ? { warehouseId: selectedWarehouseId } : undefined

  const { data: exceptionsResponse } = useGetFulfillmentExceptionsQuery(warehouseFilter)

  return (
    <RequirePermission permission="FULFILLMENT_VIEW" title="fulfillment">
      <div className="page-stack max-w-full overflow-x-hidden p-0 sm:p-0">
        <PageHeader
          title="Fulfillment & logistics"
          description="Pick lists, driver dispatch, routes, and delivery tracking."
        />

        {multiWarehouseActive && warehouses.length > 0 && (
          <div className="flex max-w-md flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="fulfillment-warehouse">Warehouse filter</Label>
              <select
                id="fulfillment-warehouse"
                className="mt-1.5 flex h-10 w-full rounded-lg border border-[var(--app-border-mid)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)]/30"
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
              >
                <option value="">All warehouses</option>
                {warehouses.map((wh: { id: string; name: string }) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.name}
                  </option>
                ))}
              </select>
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
                <span className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--red)] px-1 text-[10px] font-bold text-white">
                  {exceptionsResponse?.openCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dispatch" className="space-y-4 mt-4">
            <FulfillmentDispatchPanel warehouseId={warehouseFilter?.warehouseId} />
          </TabsContent>

          <TabsContent value="picklists" className="space-y-4 mt-4">
            <FulfillmentPickListsTab />
          </TabsContent>

          <TabsContent value="routes" className="space-y-4 mt-4">
            <FulfillmentRoutesTab warehouseId={warehouseFilter?.warehouseId} />
          </TabsContent>

          <TabsContent value="tracking" className="space-y-4 mt-4">
            <FulfillmentTrackingTab />
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-4 mt-4">
            <FulfillmentExceptionsTab warehouseId={warehouseFilter?.warehouseId} />
          </TabsContent>
        </Tabs>
      </div>
    </RequirePermission>
  )
}
