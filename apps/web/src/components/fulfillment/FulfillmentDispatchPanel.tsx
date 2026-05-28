import { useMemo, useState } from 'react'
import {
  useGetFulfillmentDispatchQuery,
  useGetSupplierDeliveryBoardQuery,
  useGetDriversQuery,
} from '../../services/api'
import { DriverDispatchBoard } from './DriverDispatchBoard'
import { FulfillmentDispatchFilters } from './FulfillmentDispatchFilters'
import {
  DISPATCH_FILTER_ALL,
  type DispatchBoardData,
  type DispatchFilters,
  enrichOrderFromBoard,
  filterDispatchBoard,
  hasActiveDispatchFilters,
  computeDispatchSummary,
} from './fulfillmentDispatchUtils'

const EMPTY_FILTERS: DispatchFilters = {
  date: '',
  status: DISPATCH_FILTER_ALL,
  driverId: DISPATCH_FILTER_ALL,
  area: '',
}

type Props = {
  warehouseId?: string
}

export function FulfillmentDispatchPanel({ warehouseId }: Props) {
  const [filters, setFilters] = useState<DispatchFilters>(EMPTY_FILTERS)
  const filtersActive = hasActiveDispatchFilters(filters)

  const { data: driversData } = useGetDriversQuery(
    warehouseId ? { warehouseId, active: true } : { active: true }
  )
  const drivers = driversData?.drivers ?? []

  const {
    data: dispatchRaw,
    isLoading: dispatchLoading,
    isError: dispatchError,
    refetch: refetchDispatch,
  } = useGetFulfillmentDispatchQuery(warehouseId ? { warehouseId } : undefined)

  const boardQueryArgs = filtersActive
    ? {
        date: filters.date || undefined,
        status: filters.status === DISPATCH_FILTER_ALL ? undefined : filters.status,
        driverId: filters.driverId === DISPATCH_FILTER_ALL ? undefined : filters.driverId,
        area: filters.area.trim() || undefined,
      }
    : undefined

  const { data: enrichBoardData } = useGetSupplierDeliveryBoardQuery(undefined)

  const {
    data: filterBoardData,
    isFetching: boardFetching,
    isError: boardError,
    refetch: refetchBoard,
  } = useGetSupplierDeliveryBoardQuery(boardQueryArgs, { skip: !filtersActive })

  const boardById = useMemo(() => {
    const map = new Map<
      string,
      {
        orderId: string
        deliveryArea?: string
        deliveryStatus?: string
        scheduledAt?: string
      }
    >()
    const orders = enrichBoardData?.orders as
      | Array<{
          orderId: string
          deliveryArea?: string
          deliveryStatus?: string
          scheduledAt?: string
        }>
      | undefined
    if (!orders) return map
    for (const o of orders) {
      map.set(o.orderId, o)
    }
    return map
  }, [enrichBoardData?.orders])

  const enrichedDispatch = useMemo((): DispatchBoardData | null => {
    if (!dispatchRaw) return null
    const enrichList = (list: DispatchBoardData['pending']) =>
      list.map((o) => enrichOrderFromBoard(o, boardById))

    return {
      ...dispatchRaw,
      pending: enrichList(dispatchRaw.pending),
      assigned: enrichList(dispatchRaw.assigned),
      out_for_delivery: enrichList(dispatchRaw.out_for_delivery),
      delivered_today: enrichList(dispatchRaw.delivered_today),
    }
  }, [dispatchRaw, boardById])

  const filteredDispatch = useMemo(() => {
    if (!enrichedDispatch) return null
    if (!filtersActive || !filterBoardData?.orders) return enrichedDispatch
    const allowed = new Set(filterBoardData.orders.map((o) => o.orderId))
    return filterDispatchBoard(enrichedDispatch, allowed)
  }, [enrichedDispatch, filtersActive, filterBoardData?.orders])

  const summary = useMemo(
    () =>
      computeDispatchSummary(
        filteredDispatch ?? {
          pending: [],
          assigned: [],
          out_for_delivery: [],
          delivered_today: [],
          stats: { pending: 0, assigned: 0, outForDelivery: 0, deliveredToday: 0 },
        },
        filtersActive ? filterBoardData?.stats : null
      ),
    [filteredDispatch, filtersActive, filterBoardData?.stats]
  )

  const handleClearFilters = () => setFilters(EMPTY_FILTERS)
  const handleRetry = () => {
    refetchDispatch()
    if (filtersActive) refetchBoard()
  }

  const isLoading = dispatchLoading || (filtersActive && boardFetching && !boardData)
  const isError = dispatchError || (filtersActive && boardError)

  return (
    <div className="space-y-4" data-testid="fulfillment-dispatch-panel">
      <FulfillmentDispatchFilters
        filters={filters}
        onChange={setFilters}
        onClear={handleClearFilters}
        drivers={drivers}
      />

      <DriverDispatchBoard
        data={filteredDispatch}
        summary={summary}
        warehouseId={warehouseId}
        isLoading={isLoading}
        isError={isError}
        filtersActive={filtersActive}
        onRetry={handleRetry}
        onClearFilters={handleClearFilters}
      />
    </div>
  )
}
