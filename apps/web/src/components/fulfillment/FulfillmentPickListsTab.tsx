import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Skeleton } from '../ui/skeleton'
import { splitRowClass } from '../ui/card-layout'
import { formatPrice } from '../../utils/format'
import { useGetOrdersQuery, useGetWarehousesQuery } from '../../services/api'
import { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const PICK_STATUSES = ['SHIPPED', 'ACKNOWLEDGED', 'PROCESSING'] as const

export function FulfillmentPickListsTab() {
  const { t } = useTranslation('fulfillment')
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState<string>('ALL')
  const { data: warehousesData } = useGetWarehousesQuery()
  const {
    data: ordersData,
    isLoading,
    isError,
    refetch,
  } = useGetOrdersQuery({
    limit: 500,
    offset: 0,
    warehouseId: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
    warehouse_id: warehouseFilter !== 'ALL' ? warehouseFilter : undefined,
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
          restaurantName: order.restaurant_name || t('pickLists.restaurantFallback'),
          status: order.status,
          itemCount: Array.isArray(order.items) ? order.items.length : 0,
          totalAmount: Number(order.total_amount) || 0,
          placedAt: order.placed_at || order.created_at,
          warehouseName: order.warehouse_name,
        })
      )
  }, [ordersData, search, t])

  return (
    <section
      data-testid="fulfillment-picklists-tab"
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
    >
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <div className={splitRowClass}>
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <ClipboardList className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
              {t('pickLists.title')}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-mid)]">{t('pickLists.subtitle')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {(warehousesData?.warehouses?.length ?? 0) > 0 && (
              <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={t('pickLists.allWarehouses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('pickLists.allWarehouses')}</SelectItem>
                  {(warehousesData?.warehouses ?? []).map((wh: { id: string; name: string }) => (
                    <SelectItem key={wh.id} value={wh.id}>
                      {wh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              placeholder={t('pickLists.searchPlaceholder')}
              className="w-full sm:max-w-xs shrink-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </header>
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3" data-testid="picklists-loading">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center" data-testid="picklists-error" role="alert">
            <p className="text-sm text-[var(--text-muted)]">{t('pickLists.loadFailed')}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => refetch()}
            >
              {t('common:actions.retry')}
            </Button>
          </div>
        ) : pickOrders.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 text-center"
            data-testid="picklists-empty"
          >
            <ClipboardList className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]" aria-hidden />
            <p className="text-sm font-medium text-[var(--text)]">{t('pickLists.emptyTitle')}</p>
            <p className="mt-1 text-xs text-[var(--text-mid)]">{t('pickLists.emptyDescription')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden" data-testid="picklists-cards">
              {pickOrders.map((order) => (
                <article
                  key={order.id}
                  className="rounded-xl border border-[var(--app-border)] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        #{order.orderRef}
                      </p>
                      <p className="font-medium">{order.restaurantName}</p>
                    </div>
                    <Badge variant={order.status === 'SHIPPED' ? 'default' : 'secondary'}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('pickLists.table.items')}
                      </p>
                      <p>{order.itemCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('pickLists.table.total')}
                      </p>
                      <p>{formatPrice(order.totalAmount)}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('pickLists.table.warehouse')}
                      </p>
                      <p>{order.warehouseName || '—'}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link to={`/app/orders/${order.id}`}>{t('pickLists.table.openOrder')}</Link>
                  </Button>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto -mx-1 px-1 md:block">
              <table className="w-full min-w-[560px] text-sm" data-testid="picklists-table">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="p-2 font-medium">{t('pickLists.table.order')}</th>
                    <th className="p-2 font-medium">{t('pickLists.table.restaurant')}</th>
                    <th className="p-2 font-medium">{t('pickLists.table.items')}</th>
                    <th className="p-2 font-medium">{t('pickLists.table.total')}</th>
                    <th className="p-2 font-medium">{t('pickLists.table.warehouse')}</th>
                    <th className="p-2 font-medium">{t('pickLists.table.status')}</th>
                    <th className="p-2 font-medium text-right">{t('pickLists.table.action')}</th>
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
                          <Link to={`/app/orders/${order.id}`}>{t('pickLists.table.open')}</Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
