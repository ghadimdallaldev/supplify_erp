import { useState } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'

import { Button } from '../../ui/button'
import { Input } from '../../ui/input'

import { Label } from '../../ui/label'

import { StatusBadge } from '../../ui/status-badge'

import {
  useCreateStaffPayrollExportMutation,
  useGetStaffPayrollExportsQuery,
  useLazyGetStaffPayrollPreviewQuery,
  useUpdateStaffPayrollExportMutation,
} from '../../../services/staffApi'

import { clampToISODate } from '../staffShared'

import { formatPrice } from '../../../utils/format'

export function StaffReportsTab() {
  const { t } = useTranslation('staff')
  const [payrollForm, setPayrollForm] = useState({
    periodStart: clampToISODate(new Date(new Date().getTime() - 14 * 24 * 60 * 60 * 1000)),

    periodEnd: clampToISODate(new Date()),
  })

  const { data: payrollExports = [], isLoading: payrollLoading } = useGetStaffPayrollExportsQuery()

  const [fetchPreview, { data: preview, isFetching: previewLoading }] =
    useLazyGetStaffPayrollPreviewQuery()

  const [createPayrollExport, { isLoading: creatingPayroll }] =
    useCreateStaffPayrollExportMutation()

  const [updatePayrollExport, { isLoading: updatingPayroll }] =
    useUpdateStaffPayrollExportMutation()

  const handleLoadPreview = async () => {
    if (!payrollForm.periodStart || !payrollForm.periodEnd) {
      toast.error(t('reports.validationPeriod'))

      return
    }

    try {
      await fetchPreview({
        periodStart: payrollForm.periodStart,

        periodEnd: payrollForm.periodEnd,
      }).unwrap()
    } catch {
      toast.error(t('reports.previewFailed'))
    }
  }

  const handleCreatePayroll = async () => {
    if (!payrollForm.periodStart || !payrollForm.periodEnd) {
      toast.error(t('reports.validationExportDates'))

      return
    }

    try {
      await createPayrollExport({
        periodStart: payrollForm.periodStart,

        periodEnd: payrollForm.periodEnd,

        usePreview: true,
      }).unwrap()

      toast.success(t('reports.exportCreated'))
    } catch {
      toast.error(t('reports.exportFailed'))
    }
  }

  const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'EXPORTED') => {
    try {
      await updatePayrollExport({ id, status }).unwrap()

      toast.success(t('reports.exportMarked', { status: status.toLowerCase() }))
    } catch {
      toast.error(t('reports.exportUpdateFailed'))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('reports.labourTitle')}</CardTitle>

          <CardDescription>{t('reports.labourDescription')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="payrollStart">{t('reports.periodStart')}</Label>

              <Input
                id="payrollStart"
                type="date"
                value={payrollForm.periodStart}
                onChange={(event) =>
                  setPayrollForm((prev) => ({ ...prev, periodStart: event.target.value }))
                }
              />
            </div>

            <div>
              <Label htmlFor="payrollEnd">{t('reports.periodEnd')}</Label>

              <Input
                id="payrollEnd"
                type="date"
                value={payrollForm.periodEnd}
                onChange={(event) =>
                  setPayrollForm((prev) => ({ ...prev, periodEnd: event.target.value }))
                }
              />
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={handleLoadPreview} disabled={previewLoading}>
                {previewLoading ? t('reports.loadingPreview') : t('reports.previewHours')}
              </Button>

              <Button onClick={handleCreatePayroll} disabled={creatingPayroll}>
                {creatingPayroll ? t('reports.generating') : t('reports.generateExport')}
              </Button>
            </div>
          </div>

          {preview ? (
            <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/30 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">{t('reports.totalHours')}</p>

                  <p className="text-lg font-semibold text-[var(--text)]">{preview.totalHours}h</p>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-muted)]">{t('reports.breakMinutes')}</p>

                  <p className="text-lg font-semibold text-[var(--text)]">
                    {preview.totalBreakMinutes}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-muted)]">{t('reports.estLabourCost')}</p>

                  <p className="text-lg font-semibold text-[var(--text)]">
                    {preview.estimatedLabourCost != null
                      ? formatPrice(preview.estimatedLabourCost)
                      : t('shared.notAvailable')}
                  </p>
                </div>
              </div>

              {preview.note ? <p className="text-xs text-amber-700">{preview.note}</p> : null}

              {preview.staffMissingRate.length > 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  {t('reports.missingRates', {
                    names: preview.staffMissingRate.map((s) => s.staffName).join(', '),
                  })}
                </p>
              ) : null}

              {preview.staffLines.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--app-border)] bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--brand-ultra)]">
                      <tr>
                        <th className="px-3 py-2 text-left">{t('shared.staff')}</th>

                        <th className="px-3 py-2 text-left">{t('team.role')}</th>

                        <th className="px-3 py-2 text-left">{t('reports.hoursColumn')}</th>

                        <th className="px-3 py-2 text-left">{t('reports.estCostColumn')}</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[var(--app-border)]">
                      {preview.staffLines.map((line) => (
                        <tr key={line.staffId}>
                          <td className="px-3 py-2">{line.staffName}</td>

                          <td className="px-3 py-2 text-[var(--text-muted)]">{line.role}</td>

                          <td className="px-3 py-2">{line.hours}h</td>

                          <td className="px-3 py-2">
                            {line.estimatedCost != null
                              ? formatPrice(line.estimatedCost)
                              : t('shared.notAvailable')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('reports.payrollTitle')}</CardTitle>

          <CardDescription>{t('reports.payrollDescription')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {payrollLoading ? (
            <p className="text-sm text-[var(--text-muted)]">{t('reports.loadingExports')}</p>
          ) : payrollExports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>{t('reports.noExports')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.period')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.status')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.totals')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.export')}
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      {t('shared.actions')}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[var(--app-border)]">
                  {payrollExports.map((exportRow) => (
                    <tr key={exportRow.id}>
                      <td className="px-4 py-3 text-[var(--text-mid)]">
                        {format(new Date(exportRow.periodStart), 'MMM d, yyyy')} –{' '}
                        {format(new Date(exportRow.periodEnd), 'MMM d, yyyy')}
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge status={exportRow.status} label={exportRow.status} />
                      </td>

                      <td className="px-4 py-3 text-[var(--text-mid)]">
                        {exportRow.totals &&
                        typeof exportRow.totals === 'object' &&
                        'totalHours' in exportRow.totals
                          ? `${exportRow.totals.totalHours}h`
                          : exportRow.totals
                            ? t('shared.seeExport')
                            : t('shared.emDash')}
                      </td>

                      <td className="px-4 py-3 text-[var(--text-mid)]">
                        {exportRow.exportUrl ? (
                          <a
                            href={exportRow.exportUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
                          >
                            {t('shared.download')}
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            {t('reports.exportFileMissing')}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {exportRow.status === 'DRAFT' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingPayroll}
                              onClick={() => handleStatusUpdate(exportRow.id, 'APPROVED')}
                            >
                              {t('shared.approve')}
                            </Button>
                          ) : null}

                          {exportRow.status === 'APPROVED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingPayroll}
                              onClick={() => handleStatusUpdate(exportRow.id, 'EXPORTED')}
                            >
                              {t('reports.markExported')}
                            </Button>
                          ) : null}
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
    </div>
  )
}
