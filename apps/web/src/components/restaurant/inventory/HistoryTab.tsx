import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { FileText } from 'lucide-react'
import { useGetRestaurantInventoryHistoryQuery } from '../../../services/api'
import { Select, SelectTrigger } from '../../ui/select'
import {
  getMovementBadgeVariant,
  getMovementSource,
  getMovementTypeLabel,
  getMovementTypeText,
} from './inventoryShared'

export function HistoryTab() {
  const [historySource, setHistorySource] = useState('ALL')
  const { data: historyData, isLoading: isLoadingHistory } = useGetRestaurantInventoryHistoryQuery({
    limit: 50,
  })
  const history = historyData?.history || []
  const filteredHistory =
    historySource === 'ALL'
      ? history
      : history.filter((m: any) => getMovementSource(m) === historySource)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inventory Movement History</CardTitle>
          <CardDescription>Recent inventory changes and adjustments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <label htmlFor="history-source-filter" className="text-sm text-[var(--text-muted)]">
              Source
            </label>
            <Select value={historySource} onValueChange={setHistorySource}>
              <SelectTrigger id="history-source-filter" className="sm:w-48">
                <option value="ALL">All</option>
                <option value="Order">Order</option>
                <option value="Manual">Manual</option>
              </SelectTrigger>
            </Select>
          </div>
          {isLoadingHistory ? (
            <div className="text-center py-12">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-[var(--text-muted)] mx-auto mb-4" />
              <p className="text-[var(--text-muted)]">No inventory movements yet</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] py-12 text-center">
              <p className="text-[var(--text-muted)]">No movements match this filter.</p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="space-y-3 md:hidden">
                {filteredHistory.map((movement: any) => {
                  const source = getMovementSource(movement)
                  const typeLabel = getMovementTypeLabel(movement, source)
                  return (
                    <div
                      key={movement.id}
                      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[var(--text)]">
                            {movement.product_name}
                          </p>
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {movement.product_sku} · {source}
                          </p>
                        </div>
                        <Badge variant={getMovementBadgeVariant(typeLabel)} className="shrink-0">
                          {getMovementTypeText(typeLabel)}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="font-semibold text-[var(--text)]">
                          {movement.quantity > 0 ? '+' : ''}
                          {movement.quantity}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          {movement.balance_before} → {movement.balance_after}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        {new Date(movement.created_at).toLocaleString()}
                      </p>
                      {movement.reason ? (
                        <p className="mt-1 text-xs text-[var(--text-mid)]">{movement.reason}</p>
                      ) : null}
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
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Product
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Source
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Balance Before
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Balance After
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {filteredHistory.map((movement: any) => {
                      const source = getMovementSource(movement)
                      const typeLabel = getMovementTypeLabel(movement, source)
                      return (
                        <tr key={movement.id} className="hover:bg-[var(--brand-ultra)]">
                          <td className="px-4 py-4 text-sm text-[var(--text)]">
                            {new Date(movement.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-[var(--text)]">
                                {movement.product_name}
                              </p>
                              <p className="text-sm text-[var(--text-muted)]">
                                {movement.product_sku}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant={getMovementBadgeVariant(typeLabel)}>
                              {getMovementTypeText(typeLabel)}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--text)]">{source}</td>
                          <td className="px-4 py-4 text-sm text-[var(--text)]">
                            {movement.quantity > 0 ? '+' : ''}
                            {movement.quantity}
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                            {movement.balance_before}
                          </td>
                          <td className="px-4 py-4 text-sm font-medium text-[var(--text)]">
                            {movement.balance_after}
                          </td>
                          <td className="px-4 py-4 text-sm text-[var(--text-muted)]">
                            {movement.reason || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
