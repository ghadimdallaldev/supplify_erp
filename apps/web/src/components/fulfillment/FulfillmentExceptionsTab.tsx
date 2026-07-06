import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
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
import { toast } from 'sonner'
import { TableScroll } from '../ui/table-scroll'
import { responsiveDataListClasses } from '../ui/responsive-data-list'
import { cn } from '../../lib/utils'

type Props = {
  warehouseId?: string
}

export function FulfillmentExceptionsTab({ warehouseId }: Props) {
  const { t } = useTranslation('fulfillment')
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
      toast.success(t('exceptions.toast.resolved'))
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('exceptions.toast.resolveFailed')
      toast.error(message)
    }
  }

  const handleIgnore = async (id: string) => {
    try {
      await ignoreException(id).unwrap()
      toast.success(t('exceptions.toast.ignored'))
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('exceptions.toast.ignoreFailed')
      toast.error(message)
    }
  }

  return (
    <section
      data-testid="fulfillment-exceptions-tab"
      className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
    >
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <AlertCircle className="h-4 w-4 text-[var(--brand-mid)]" aria-hidden />
          {t('exceptions.title')}
          {openCount > 0 && (
            <Badge variant="destructive" data-testid="exceptions-open-count">
              {t('exceptions.openCount', { count: openCount })}
            </Badge>
          )}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--text-mid)]">{t('exceptions.subtitle')}</p>
      </header>
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-3" data-testid="exceptions-loading">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <div className="py-10 text-center" data-testid="exceptions-error" role="alert">
            <p className="text-sm text-[var(--text-muted)]">{t('exceptions.loadFailed')}</p>
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
        ) : exceptions.length === 0 ? (
          <div
            className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 text-center"
            data-testid="exceptions-empty"
          >
            <AlertCircle className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]" aria-hidden />
            <p className="text-sm text-[var(--text-mid)]">{t('exceptions.empty')}</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 lg:hidden" data-testid="exceptions-cards">
              {exceptions.map((ex) => (
                <article
                  key={ex.id}
                  className="rounded-xl border border-[var(--app-border)] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{ex.exceptionType.replace(/_/g, ' ')}</p>
                      {ex.description && (
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{ex.description}</p>
                      )}
                    </div>
                    <Badge variant={ex.status === 'open' ? 'destructive' : 'secondary'}>
                      {ex.status || 'open'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('exceptions.table.order')}
                      </p>
                      <p className="font-mono text-xs">{ex.orderLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('exceptions.table.restaurant')}
                      </p>
                      <p>{ex.restaurantName || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('exceptions.table.created')}
                      </p>
                      <p>
                        {ex.createdAt
                          ? new Date(ex.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>
                  {canManage && ex.status === 'open' && (
                    <div>
                      <Label htmlFor={`notes-card-${ex.id}`} className="text-xs">
                        {t('exceptions.table.resolutionNotes')}
                      </Label>
                      <Textarea
                        id={`notes-card-${ex.id}`}
                        rows={2}
                        className="mt-1 text-xs"
                        value={notesById[ex.id] ?? ''}
                        onChange={(e) =>
                          setNotesById((prev) => ({ ...prev, [ex.id]: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {ex.orderId && (
                      <Button variant="outline" size="sm" className="flex-1" asChild>
                        <Link to={`/app/orders/${ex.orderId}`}>
                          {t('exceptions.table.viewOrder')}
                        </Link>
                      </Button>
                    )}
                    {canManage && ex.status === 'open' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="flex-1"
                          disabled={isResolving || isIgnoring}
                          data-testid={`exception-resolve-${ex.id}`}
                          onClick={() => handleResolve(ex.id)}
                        >
                          {t('exceptions.table.resolve')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          disabled={isResolving || isIgnoring}
                          data-testid={`exception-ignore-${ex.id}`}
                          onClick={() => handleIgnore(ex.id)}
                        >
                          {t('exceptions.table.ignore')}
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <TableScroll aria-label={t('exceptions.title')} className="hidden lg:block">
              <table className="w-full min-w-[640px] text-sm" data-testid="exceptions-table">
                <thead>
                  <tr className="border-b text-left text-[var(--text-muted)]">
                    <th className="p-2 font-medium">{t('exceptions.table.type')}</th>
                    <th
                      className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                    >
                      {t('exceptions.table.order')}
                    </th>
                    <th
                      className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                    >
                      {t('exceptions.table.restaurant')}
                    </th>
                    <th
                      className={cn('p-2 font-medium', responsiveDataListClasses.columnSecondary)}
                    >
                      {t('exceptions.table.status')}
                    </th>
                    <th className={cn('p-2 font-medium', responsiveDataListClasses.columnTertiary)}>
                      {t('exceptions.table.created')}
                    </th>
                    <th className="p-2 font-medium text-right">{t('exceptions.table.action')}</th>
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
                          <div className="mt-2 max-w-xs hidden xl:block">
                            <Label htmlFor={`notes-${ex.id}`} className="text-xs">
                              {t('exceptions.table.resolutionNotes')}
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
                      <td
                        className={cn(
                          'p-2 font-mono text-xs',
                          responsiveDataListClasses.columnSecondary
                        )}
                      >
                        {ex.orderLabel}
                      </td>
                      <td className={cn('p-2', responsiveDataListClasses.columnSecondary)}>
                        {ex.restaurantName || '—'}
                      </td>
                      <td className={cn('p-2', responsiveDataListClasses.columnSecondary)}>
                        <Badge variant={ex.status === 'open' ? 'destructive' : 'secondary'}>
                          {ex.status || 'open'}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          'p-2 text-[var(--text-muted)] whitespace-nowrap',
                          responsiveDataListClasses.columnTertiary
                        )}
                      >
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
                              <Link to={`/app/orders/${ex.orderId}`}>
                                {t('exceptions.table.viewOrder')}
                              </Link>
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
                                {t('exceptions.table.resolve')}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isResolving || isIgnoring}
                                data-testid={`exception-ignore-${ex.id}`}
                                onClick={() => handleIgnore(ex.id)}
                              >
                                {t('exceptions.table.ignore')}
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </>
        )}
      </div>
    </section>
  )
}
