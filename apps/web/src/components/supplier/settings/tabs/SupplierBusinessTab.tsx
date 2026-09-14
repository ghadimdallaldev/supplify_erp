import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Textarea } from '../../../ui/textarea'
import { Badge } from '../../../ui/badge'
import { Clock, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetSupplierBusinessSettingsQuery,
  useUpdateSupplierBusinessSettingsMutation,
} from '../../../../services/api'
import type { SupplierBusinessDayHours, SupplierBusinessSettings } from '../../../../types'
import { ensureNamespace } from '../../../../i18n'

const BUSINESS_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

type BusinessDayKey = (typeof BUSINESS_DAY_KEYS)[number]

function emptyBusinessForm(): SupplierBusinessSettings {
  const operatingHours = {} as SupplierBusinessSettings['operatingHours']
  for (const day of BUSINESS_DAY_KEYS) {
    operatingHours[day] = { open: '09:00', close: '17:00', closed: false }
  }
  return {
    operatingHours,
    minimumOrderAmount: null,
    paymentTerms: '',
    returnPolicy: '',
    termsAndConditions: '',
    lastOrderMode: 'none',
    lastOrderCutoffType: 'absolute_time',
    lastOrderCutoffTime: '15:00',
    lastOrderCutoffMinutes: 30,
    lastOrderRolloverDays: 1,
    lastOrderTimezone: 'UTC',
    podRequired: false,
  }
}

export function SupplierBusinessTab() {
  const { t } = useTranslation('suppliers')
  const { data, isLoading, isFetching } = useGetSupplierBusinessSettingsQuery()
  const [updateBusinessSettings, { isLoading: isSaving }] =
    useUpdateSupplierBusinessSettingsMutation()
  const [form, setForm] = useState<SupplierBusinessSettings>(() => emptyBusinessForm())

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  useEffect(() => {
    if (data?.business) {
      setForm({
        operatingHours: { ...data.business.operatingHours },
        minimumOrderAmount: data.business.minimumOrderAmount,
        paymentTerms: data.business.paymentTerms ?? '',
        returnPolicy: data.business.returnPolicy ?? '',
        termsAndConditions: data.business.termsAndConditions ?? '',
        lastOrderMode: data.business.lastOrderMode ?? 'none',
        lastOrderCutoffType: data.business.lastOrderCutoffType ?? 'absolute_time',
        lastOrderCutoffTime: data.business.lastOrderCutoffTime ?? '15:00',
        lastOrderCutoffMinutes: data.business.lastOrderCutoffMinutes ?? 30,
        lastOrderRolloverDays: data.business.lastOrderRolloverDays ?? 1,
        lastOrderTimezone: data.business.lastOrderTimezone ?? 'UTC',
        podRequired: Boolean(data.business.podRequired),
      })
    }
  }, [data?.business])

  const isBusy = isLoading || isFetching || isSaving

  const dayRows = useMemo(
    () =>
      BUSINESS_DAY_KEYS.map((dayKey) => ({
        dayKey,
        hours: form.operatingHours[dayKey],
      })),
    [form.operatingHours]
  )

  const updateDay = (dayKey: BusinessDayKey, patch: Partial<SupplierBusinessDayHours>) => {
    setForm((prev) => ({
      ...prev,
      operatingHours: {
        ...prev.operatingHours,
        [dayKey]: { ...prev.operatingHours[dayKey], ...patch },
      },
    }))
  }

  const toggleDayClosed = (dayKey: BusinessDayKey) => {
    setForm((prev) => {
      const current = prev.operatingHours[dayKey]
      const closed = !current.closed
      return {
        ...prev,
        operatingHours: {
          ...prev.operatingHours,
          [dayKey]: closed
            ? { open: '', close: '', closed: true }
            : {
                open: current.open || '09:00',
                close: current.close || '17:00',
                closed: false,
              },
        },
      }
    })
  }

  const handleSave = async () => {
    try {
      await updateBusinessSettings({
        operatingHours: form.operatingHours,
        minimumOrderAmount:
          form.minimumOrderAmount === null || form.minimumOrderAmount === undefined
            ? null
            : Number(form.minimumOrderAmount),
        paymentTerms: form.paymentTerms.trim() || null,
        returnPolicy: form.returnPolicy.trim() || null,
        termsAndConditions: form.termsAndConditions.trim() || null,
        lastOrderMode: form.lastOrderMode ?? 'none',
        lastOrderCutoffType: form.lastOrderCutoffType ?? null,
        lastOrderCutoffTime: form.lastOrderCutoffTime ?? null,
        lastOrderCutoffMinutes: form.lastOrderCutoffMinutes ?? null,
        lastOrderRolloverDays: form.lastOrderRolloverDays ?? 1,
        lastOrderTimezone: form.lastOrderTimezone ?? 'UTC',
        podRequired: Boolean(form.podRequired),
      }).unwrap()
      toast.success(t('business.toast.saved'))
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { error?: { message?: string } } }).data?.error?.message
          : undefined
      toast.error(message || t('business.toast.saveFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('business.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('business.title')}
          </CardTitle>
          <CardDescription>{t('business.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{t('business.operatingHours')}</h3>
              <Badge variant="outline">{t('business.configureSchedule')}</Badge>
            </div>
            <div className="space-y-3">
              {dayRows.map(({ dayKey, hours }) => (
                <div
                  key={dayKey}
                  className="flex flex-col gap-3 p-3 border rounded-lg hover:bg-[var(--brand-ultra)] sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="w-full font-medium sm:w-28">{t(`business.days.${dayKey}`)}</div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                    <Input
                      type="time"
                      className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                      value={hours.closed ? '' : hours.open}
                      disabled={hours.closed || isBusy}
                      onChange={(event) => updateDay(dayKey, { open: event.target.value })}
                    />
                    <span className="text-[var(--text-muted)]">{t('business.to')}</span>
                    <Input
                      type="time"
                      className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                      value={hours.closed ? '' : hours.close}
                      disabled={hours.closed || isBusy}
                      onChange={(event) => updateDay(dayKey, { close: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant={hours.closed ? 'default' : 'outline'}
                    size="sm"
                    className="w-full sm:ml-auto sm:w-auto"
                    disabled={isBusy}
                    onClick={() => toggleDayClosed(dayKey)}
                  >
                    {hours.closed ? t('business.open') : t('business.closed')}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">
                {t('business.lastOrder.title', { defaultValue: 'Restaurant last-order rules' })}
              </h3>
              <Badge variant="outline">
                {t('business.lastOrder.badge', { defaultValue: 'Delivery timing' })}
              </Badge>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {t('business.lastOrder.description', {
                defaultValue:
                  'Choose no cutoff (restaurants can order anytime for the next day) or a cutoff that rolls delivery to tomorrow, day-after, or a period you set.',
              })}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="last-order-mode">
                  {t('business.lastOrder.mode', { defaultValue: 'Mode' })}
                </Label>
                <select
                  id="last-order-mode"
                  className="flex h-10 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 text-sm"
                  value={form.lastOrderMode ?? 'none'}
                  disabled={isBusy}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      lastOrderMode: event.target.value as 'none' | 'cutoff',
                    }))
                  }
                >
                  <option value="none">
                    {t('business.lastOrder.modeNone', { defaultValue: 'No last-order time' })}
                  </option>
                  <option value="cutoff">
                    {t('business.lastOrder.modeCutoff', { defaultValue: 'Enforce cutoff' })}
                  </option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-order-rollover">
                  {t('business.lastOrder.rolloverDays', {
                    defaultValue: 'Roll delivery forward (days)',
                  })}
                </Label>
                <Input
                  id="last-order-rollover"
                  type="number"
                  min={1}
                  max={14}
                  value={form.lastOrderRolloverDays ?? 1}
                  disabled={isBusy || form.lastOrderMode !== 'cutoff'}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      lastOrderRolloverDays: Number(event.target.value) || 1,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-order-cutoff-type">
                  {t('business.lastOrder.cutoffType', { defaultValue: 'Cutoff type' })}
                </Label>
                <select
                  id="last-order-cutoff-type"
                  className="flex h-10 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 text-sm"
                  value={form.lastOrderCutoffType ?? 'absolute_time'}
                  disabled={isBusy || form.lastOrderMode !== 'cutoff'}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      lastOrderCutoffType: event.target.value as
                        | 'absolute_time'
                        | 'minutes_before_window',
                    }))
                  }
                >
                  <option value="absolute_time">
                    {t('business.lastOrder.absoluteTime', {
                      defaultValue: 'Clock time (e.g. 15:00)',
                    })}
                  </option>
                  <option value="minutes_before_window">
                    {t('business.lastOrder.minutesBefore', {
                      defaultValue: 'Minutes before delivery day',
                    })}
                  </option>
                </select>
              </div>
              {form.lastOrderCutoffType === 'minutes_before_window' ? (
                <div className="space-y-2">
                  <Label htmlFor="last-order-minutes">
                    {t('business.lastOrder.minutes', { defaultValue: 'Minutes before window' })}
                  </Label>
                  <Input
                    id="last-order-minutes"
                    type="number"
                    min={1}
                    max={1440}
                    value={form.lastOrderCutoffMinutes ?? 30}
                    disabled={isBusy || form.lastOrderMode !== 'cutoff'}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        lastOrderCutoffMinutes: Number(event.target.value) || 30,
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="last-order-time">
                    {t('business.lastOrder.time', { defaultValue: 'Cutoff time' })}
                  </Label>
                  <Input
                    id="last-order-time"
                    type="time"
                    value={form.lastOrderCutoffTime ?? '15:00'}
                    disabled={isBusy || form.lastOrderMode !== 'cutoff'}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        lastOrderCutoffTime: event.target.value,
                      }))
                    }
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{t('business.policies')}</h3>
              <Badge variant="outline">{t('business.termsBadge')}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-order-amount">{t('business.minOrderValue')}</Label>
                <Input
                  id="min-order-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="100.00"
                  value={form.minimumOrderAmount ?? ''}
                  disabled={isBusy}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      minimumOrderAmount:
                        event.target.value === '' ? null : Number(event.target.value),
                    }))
                  }
                />
                <p className="text-xs text-[var(--text-muted)]">{t('business.minOrderHint')}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pod-required">
                  {t('business.podRequired', { defaultValue: 'Require proof of delivery' })}
                </Label>
                <label
                  htmlFor="pod-required"
                  className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--text-mid)]"
                >
                  <input
                    id="pod-required"
                    type="checkbox"
                    checked={Boolean(form.podRequired)}
                    disabled={isBusy}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        podRequired: event.target.checked,
                      }))
                    }
                  />
                  {t('business.podRequiredHint', {
                    defaultValue:
                      'Drivers and dispatch must attach POD before marking an order delivered',
                  })}
                </label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-terms">{t('business.paymentTerms')}</Label>
                <Input
                  id="payment-terms"
                  placeholder={t('business.paymentTermsPlaceholder')}
                  value={form.paymentTerms}
                  disabled={isBusy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, paymentTerms: event.target.value }))
                  }
                />
                <p className="text-xs text-[var(--text-muted)]">{t('business.paymentTermsHint')}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="return-policy">{t('business.returnPolicy')}</Label>
                <Textarea
                  id="return-policy"
                  placeholder={t('business.returnPolicyPlaceholder')}
                  rows={3}
                  value={form.returnPolicy}
                  disabled={isBusy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, returnPolicy: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="terms-conditions">{t('business.termsConditions')}</Label>
                <Textarea
                  id="terms-conditions"
                  placeholder={t('business.termsPlaceholder')}
                  rows={4}
                  value={form.termsAndConditions}
                  disabled={isBusy}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, termsAndConditions: event.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          <Button type="button" onClick={() => void handleSave()} disabled={isBusy}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t('business.save')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
