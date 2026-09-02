import { AppPanel } from '../../ui/app-panel'
import { Skeleton } from '../../ui/skeleton'
import {
  useGetRestaurantInventoryQuery,
  useGetRestaurantInventoryHistoryQuery,
} from '../../../services/api'
import { getMovementSource } from './inventoryShared'

export function TotalsTab() {
  const { data, isLoading: isLoadingInventory } = useGetRestaurantInventoryQuery({ limit: 100 })
  const { data: historyData, isLoading: isLoadingHistory } = useGetRestaurantInventoryHistoryQuery({
    limit: 50,
  })
  const inventory = data?.inventory || []
  const history = historyData?.history || []

  if (isLoadingInventory || isLoadingHistory) {
    return <Skeleton className="h-64 w-full rounded-lg" />
  }

  return (
    <div className="space-y-6">
      <AppPanel
        title="Totals After Receiving"
        description="Current stock per product and last update source"
      >
        {inventory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] py-12 text-center">
            <p className="text-[var(--text-muted)]">No inventory yet.</p>
          </div>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="space-y-3 md:hidden">
              {inventory.map((item: any) => {
                const lastMovement = history.find((m: any) => m.product_id === item.product_id)
                const source = lastMovement ? getMovementSource(lastMovement) : '—'
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--text)]">
                          {item.product_name}
                        </p>
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          {item.product_sku}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-lg font-bold text-[var(--text)]">
                        {item.quantity}{' '}
                        <span className="text-sm font-medium text-[var(--text-muted)]">
                          {item.product_unit}
                        </span>
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                      <span>
                        Last source: <span className="text-[var(--text)]">{source}</span>
                      </span>
                      <span>
                        {lastMovement ? new Date(lastMovement.created_at).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                      Product
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                      Current Total
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                      Unit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                      Last Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                      Last Change
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {inventory.map((item: any) => {
                    const lastMovement = history.find((m: any) => m.product_id === item.product_id)
                    const source = lastMovement ? getMovementSource(lastMovement) : '—'
                    return (
                      <tr key={item.id} className="hover:bg-[var(--brand-ultra)]">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-[var(--text)]">{item.product_name}</p>
                            <p className="text-sm text-[var(--text-muted)]">{item.product_sku}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4 font-semibold">{item.quantity}</td>
                        <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                          {item.product_unit}
                        </td>
                        <td className="px-4 py-4 text-sm text-[var(--text)]">{source}</td>
                        <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                          {lastMovement ? new Date(lastMovement.created_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AppPanel>
    </div>
  )
}
