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
      <div className="space-y-6 p-4 sm:p-6 max-w-full overflow-x-hidden">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Fulfillment & Logistics</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Pick lists, driver dispatch, and delivery tracking.
          </p>
        </div>

        {multiWarehouseActive && warehouses.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <label
              htmlFor="fulfillment-warehouse"
              className="text-sm font-medium text-[var(--text)]"
            >
              Warehouse
            </label>
            <select
              id="fulfillment-warehouse"
              className="w-full sm:w-auto sm:min-w-[220px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
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
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 h-auto">
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
