import { useState } from 'react'

import { format } from 'date-fns'

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
      toast.error('Select a period start and end')

      return
    }

    try {
      await fetchPreview({
        periodStart: payrollForm.periodStart,

        periodEnd: payrollForm.periodEnd,
      }).unwrap()
    } catch {
      toast.error('Unable to load labour hours summary')
    }
  }

  const handleCreatePayroll = async () => {
    if (!payrollForm.periodStart || !payrollForm.periodEnd) {
      toast.error('Payroll export needs start and end dates')

      return
    }

    try {
      await createPayrollExport({
        periodStart: payrollForm.periodStart,

        periodEnd: payrollForm.periodEnd,

        usePreview: true,
      }).unwrap()

      toast.success('Payroll export draft created')
    } catch {
      toast.error('Unable to generate payroll export')
    }
  }

  const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'EXPORTED') => {
    try {
      await updatePayrollExport({ id, status }).unwrap()

      toast.success(`Export marked ${status.toLowerCase()}`)
    } catch {
      toast.error('Unable to update export status')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Labour hours summary</CardTitle>

          <CardDescription>
            Estimated hours and labour cost from time entries — not tax-ready payroll processing.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="payrollStart">Period start</Label>

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
              <Label htmlFor="payrollEnd">Period end</Label>

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
                {previewLoading ? 'Loading…' : 'Preview hours'}
              </Button>

              <Button onClick={handleCreatePayroll} disabled={creatingPayroll}>
                {creatingPayroll ? 'Generating…' : 'Generate payroll export'}
              </Button>
            </div>
          </div>

          {preview ? (
            <div className="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/30 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Total hours</p>

                  <p className="text-lg font-semibold text-[var(--text)]">{preview.totalHours}h</p>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-muted)]">Break minutes</p>

                  <p className="text-lg font-semibold text-[var(--text)]">
                    {preview.totalBreakMinutes}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-muted)]">Estimated labour cost</p>

                  <p className="text-lg font-semibold text-[var(--text)]">
                    {preview.estimatedLabourCost != null
                      ? formatPrice(preview.estimatedLabourCost)
                      : 'Not available'}
                  </p>
                </div>
              </div>

              {preview.note ? <p className="text-xs text-amber-700">{preview.note}</p> : null}

              {preview.staffMissingRate.length > 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Missing hourly rates:{' '}
                  {preview.staffMissingRate.map((s) => s.staffName).join(', ')}
                </p>
              ) : null}

              {preview.staffLines.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-[var(--app-border)] bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--brand-ultra)]">
                      <tr>
                        <th className="px-3 py-2 text-left">Staff</th>

                        <th className="px-3 py-2 text-left">Role</th>

                        <th className="px-3 py-2 text-left">Hours</th>

                        <th className="px-3 py-2 text-left">Est. cost</th>
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
                              : 'Not available'}
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
          <CardTitle>Payroll export</CardTitle>

          <CardDescription>
            Draft exports from time entries. Mark approved when reviewed; exported when file is
            ready.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {payrollLoading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading payroll exports…</p>
          ) : payrollExports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--app-border-mid)] bg-[var(--brand-ultra)] p-6 text-center text-sm text-[var(--text-muted)]">
              <p>No payroll exports generated yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--app-border)] text-sm">
                <thead className="bg-[var(--brand-ultra)]">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Period
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Status
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Totals
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Export
                    </th>

                    <th className="px-4 py-2 text-left font-semibold text-[var(--text-muted)]">
                      Actions
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
                            ? 'See export'
                            : '—'}
                      </td>

                      <td className="px-4 py-3 text-[var(--text-mid)]">
                        {exportRow.exportUrl ? (
                          <a
                            href={exportRow.exportUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
                          >
                            Download
                          </a>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            Export file not generated
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
                              Approve
                            </Button>
                          ) : null}

                          {exportRow.status === 'APPROVED' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingPayroll}
                              onClick={() => handleStatusUpdate(exportRow.id, 'EXPORTED')}
                            >
                              Mark exported
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
