import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import {
  useGetFulfillmentExceptionsQuery,
  useResolveFulfillmentExceptionMutation,
  useIgnoreFulfillmentExceptionMutation,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import toast from 'react-hot-toast'

type Props = {
  warehouseId?: string
}

export function FulfillmentExceptionsTab({ warehouseId }: Props) {
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE')
  const [notesById, setNotesById] = useState<Record<string, string>>({})

  const {
    data: exceptionsResponse,
    isLoading,
    isError,
    refetch,
  } = useGetFulfillmentExceptionsQuery(warehouseId ? { warehouseId } : undefined)

  const [resolveException, { isLoading: isResolving }] = useResolveFulfillmentExceptionMutation()
  const [ignoreException, { isLoading: isIgnoring }] = useIgnoreFulfillmentExceptionMutation()

  const exceptions = exceptionsResponse?.exceptions ?? []
  const openCount = exceptionsResponse?.openCount ?? 0

  const handleResolve = async (id: string) => {
    try {
      await resolveException({
        id,
        resolution_notes: notesById[id]?.trim() || undefined,
      }).unwrap()
      toast.success('Exception marked resolved')
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to resolve exception'
      toast.error(message)
    }
  }

  const handleIgnore = async (id: string) => {
    try {
      await ignoreException(id).unwrap()
      toast.success('Exception ignored')
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to ignore exception'
      toast.error(message)
    }
  }

  return (
    <Card data-testid="fulfillment-exceptions-tab">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Delivery Exceptions
          {openCount > 0 && (
            <Badge variant="destructive" className="ml-1" data-testid="exceptions-open-count">
              {openCount} open
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Short deliveries, damages, and returns requiring attention
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3" data-testid="exceptions-loading">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center" data-testid="exceptions-error" role="alert">
            <p className="text-sm text-[var(--text-muted)]">Could not load exceptions.</p>
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
        ) : exceptions.length === 0 ? (
          <div
            className="py-10 text-center text-sm text-[var(--text-muted)]"
            data-testid="exceptions-empty"
          >
            No delivery exceptions recorded.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[640px] text-sm" data-testid="exceptions-table">
              <thead>
                <tr className="border-b text-left text-[var(--text-muted)]">
                  <th className="p-2 font-medium">Type</th>
                  <th className="p-2 font-medium">Order</th>
                  <th className="p-2 font-medium">Restaurant</th>
                  <th className="p-2 font-medium">Status</th>
                  <th className="p-2 font-medium">Created</th>
                  <th className="p-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((ex) => (
                  <tr
                    key={ex.id}
                    className="border-b border-[var(--app-border)] hover:bg-[var(--brand-ultra)]"
                  >
                    <td className="p-2">
                      <span className="font-medium">{ex.exceptionType.replace(/_/g, ' ')}</span>
                      {ex.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
                          {ex.description}
                        </p>
                      )}
                      {canManage && ex.status === 'open' && (
                        <div className="mt-2 max-w-xs">
                          <Label htmlFor={`notes-${ex.id}`} className="text-xs">
                            Resolution notes (optional)
                          </Label>
                          <Textarea
                            id={`notes-${ex.id}`}
                            rows={2}
                            className="mt-1 text-xs"
                            value={notesById[ex.id] ?? ''}
                            onChange={(e) =>
                              setNotesById((prev) => ({ ...prev, [ex.id]: e.target.value }))
                            }
                          />
                        </div>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">{ex.orderLabel}</td>
                    <td className="p-2">{ex.restaurantName || '—'}</td>
                    <td className="p-2">
                      <Badge variant={ex.status === 'open' ? 'destructive' : 'secondary'}>
                        {ex.status || 'open'}
                      </Badge>
                    </td>
                    <td className="p-2 text-[var(--text-muted)] whitespace-nowrap">
                      {ex.createdAt
                        ? new Date(ex.createdAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex flex-col items-end gap-2">
                        {ex.orderId && (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/app/orders/${ex.orderId}`}>View order</Link>
                          </Button>
                        )}
                        {canManage && ex.status === 'open' && (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              disabled={isResolving || isIgnoring}
                              data-testid={`exception-resolve-${ex.id}`}
                              onClick={() => handleResolve(ex.id)}
                            >
                              Resolve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={isResolving || isIgnoring}
                              data-testid={`exception-ignore-${ex.id}`}
                              onClick={() => handleIgnore(ex.id)}
                            >
                              Ignore
                            </Button>
                          </div>
                        )}
                      </div>
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
