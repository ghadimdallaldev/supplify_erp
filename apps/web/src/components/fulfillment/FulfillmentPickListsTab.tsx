import { Link } from 'react-router-dom'
import { ClipboardList } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Skeleton } from '../ui/skeleton'
import { splitRowClass } from '../ui/card-layout'
import { formatPrice } from '../../utils/format'
import { useGetOrdersQuery } from '../../services/api'
import { useMemo, useState } from 'react'

const PICK_STATUSES = ['SHIPPED', 'ACKNOWLEDGED', 'PROCESSING'] as const

export function FulfillmentPickListsTab() {
  const [search, setSearch] = useState('')
  const {
    data: ordersData,
    isLoading,
    isError,
    refetch,
  } = useGetOrdersQuery({
    limit: 500,
    offset: 0,
  })

  const pickOrders = useMemo(() => {
    const orders = ordersData?.orders ?? []
    const q = search.trim().toLowerCase()
    return orders
      .filter((order: { status: string }) =>
        PICK_STATUSES.includes(order.status as (typeof PICK_STATUSES)[number])
      )
      .filter((order: { id: string; restaurant_name?: string }) => {
        if (!q) return true
        const name = (order.restaurant_name || '').toLowerCase()
        return name.includes(q) || order.id.toLowerCase().includes(q)
      })
      .map(
        (order: {
          id: string
          status: string
          restaurant_name?: string
          total_amount?: number
          items?: unknown[]
          placed_at?: string
          created_at?: string
          warehouse_name?: string
        }) => ({
          id: order.id,
          orderRef: order.id.slice(0, 8).toUpperCase(),
          restaurantName: order.restaurant_name || 'Restaurant',
          status: order.status,
          itemCount: Array.isArray(order.items) ? order.items.length : 0,
          totalAmount: Number(order.total_amount) || 0,
          placedAt: order.placed_at || order.created_at,
          warehouseName: order.warehouse_name,
        })
      )
  }, [ordersData, search])

  return (
    <Card data-testid="fulfillment-picklists-tab">
      <CardHeader>
        <div className={splitRowClass}>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 shrink-0" />
              Pick Lists
            </CardTitle>
            <CardDescription>Orders ready for warehouse picking</CardDescription>
          </div>
          <Input
            placeholder="Search order or restaurant…"
            className="w-full sm:max-w-xs shrink-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" data-testid="picklists-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center" data-testid="picklists-error" role="alert">
            <p className="text-sm text-[var(--text-muted)]">Could not load pick lists.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </div>
        ) : pickOrders.length === 0 ? (
          <div
            className="py-10 text-center text-sm text-[var(--text-muted)]"
            data-testid="picklists-empty"
          >
            No orders ready for picking. Orders appear here when they reach processing or shipped
            status.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-sm" data-testid="picklists-table">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="p-2 font-medium">Order</th>
                  <th className="p-2 font-medium">Restaurant</th>
                  <th className="p-2 font-medium">Items</th>
                  <th className="p-2 font-medium">Total</th>
                  <th className="p-2 font-medium">Warehouse</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pickOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                  >
                    <td className="p-2 font-mono text-xs">#{order.orderRef}</td>
                    <td className="p-2">{order.restaurantName}</td>
                    <td className="p-2 tabular-nums">{order.itemCount}</td>
                    <td className="p-2 tabular-nums">{formatPrice(order.totalAmount)}</td>
                    <td className="p-2 text-[var(--text-muted)]">{order.warehouseName || '—'}</td>
                    <td className="p-2">
                      <Badge variant={order.status === 'SHIPPED' ? 'default' : 'secondary'}>
                        {order.status}
                      </Badge>
                    </td>
                    <td className="p-2 text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/app/orders/${order.id}`}>Open</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
