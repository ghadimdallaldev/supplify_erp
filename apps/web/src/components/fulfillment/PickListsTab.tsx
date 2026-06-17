import { useMemo, useState } from 'react'
import { ClipboardList, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Skeleton } from '../ui/skeleton'
import { splitRowClass } from '../ui/card-layout'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'
import { usePermissions } from '../../hooks/usePermissions'
import {
  useCompletePickWaveMutation,
  useGeneratePickWaveMutation,
  useGetPickWaveQuery,
  useGetPickWavesQuery,
  useUpdatePickListItemMutation,
} from '../../services/api'
import { toast } from 'sonner'

type Props = {
  warehouseId?: string
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function waveStatusLabel(status: string) {
  switch (status) {
    case 'PICKING':
      return 'Picking'
    case 'PICKED':
      return 'Picked'
    case 'PENDING':
      return 'Pending'
    default:
      return status
  }
}

export function PickListsTab({ warehouseId }: Props) {
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE')
  const today = todayIsoDate()
  const [selectedWaveId, setSelectedWaveId] = useState<string | null>(null)
  const [pickedDraft, setPickedDraft] = useState<Record<string, string>>({})

  const {
    data: wavesData,
    isLoading: wavesLoading,
    isError: wavesError,
    refetch: refetchWaves,
  } = useGetPickWavesQuery({ date: today })

  const {
    data: waveDetailData,
    isLoading: detailLoading,
    isError: detailError,
    refetch: refetchDetail,
  } = useGetPickWaveQuery(selectedWaveId ?? '', { skip: !selectedWaveId })

  const [generateWave, { isLoading: isGenerating }] = useGeneratePickWaveMutation()
  const [updateItem, { isLoading: isUpdating }] = useUpdatePickListItemMutation()
  const [completeWave, { isLoading: isCompleting }] = useCompletePickWaveMutation()

  const waves = wavesData?.waves ?? []
  const wave = waveDetailData?.wave

  const allItemsPicked = useMemo(() => {
    if (!wave?.pickLists?.length) return false
    return wave.pickLists.every((pl) => pl.items.every((item) => item.quantityPicked != null))
  }, [wave])

  const handleGenerate = async () => {
    try {
      const result = await generateWave({
        date: today,
        warehouseId,
      }).unwrap()
      toast.success('Pick wave generated')
      refetchWaves()
      const newId = (result.wave as { id?: string }).id
      if (newId) setSelectedWaveId(newId)
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to generate wave'
      toast.error(message)
    }
  }

  const handleSaveItem = async (pickListId: string, itemId: string, quantityOrdered: number) => {
    const raw = pickedDraft[itemId]
    const quantityPicked = raw != null && raw !== '' ? Number(raw) : quantityOrdered
    if (!Number.isFinite(quantityPicked) || quantityPicked < 0) {
      toast.error('Enter a valid picked quantity')
      return
    }
    try {
      await updateItem({
        pickListId,
        itemId,
        quantityPicked,
      }).unwrap()
      refetchDetail()
      refetchWaves()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to update pick line'
      toast.error(message)
    }
  }

  const handleComplete = async () => {
    if (!selectedWaveId) return
    try {
      await completeWave(selectedWaveId).unwrap()
      toast.success('Wave picking completed')
      refetchWaves()
      refetchDetail()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to complete wave'
      toast.error(message)
    }
  }

  return (
    <div className="space-y-4" data-testid="fulfillment-picklists-tab">
      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
          <div className={splitRowClass}>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <ClipboardList className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
                Pick waves — {today}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--text-mid)]">
                Generate a wave for today and check off picked quantities
              </p>
            </div>
            {canManage && (
              <Button
                type="button"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                data-testid="generate-pick-wave"
              >
                {isGenerating ? 'Generating…' : 'Generate for today'}
              </Button>
            )}
          </div>
        </header>
        <div className="p-4 sm:p-5">
          {wavesLoading ? (
            <div className="space-y-3" data-testid="picklists-loading">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : wavesError ? (
            <div className="py-10 text-center" data-testid="picklists-error" role="alert">
              <p className="text-sm text-[var(--text-muted)]">Could not load pick waves.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => refetchWaves()}
              >
                Retry
              </Button>
            </div>
          ) : waves.length === 0 ? (
            <div
              className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] py-12 text-center"
              data-testid="picklists-empty"
            >
              <ClipboardList
                className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]"
                aria-hidden
              />
              <p className="text-sm font-medium text-[var(--text)]">No pick waves for today</p>
              <p className="mt-1 text-xs text-[var(--text-mid)]">
                Generate a wave from eligible processing or shipped orders.
              </p>
            </div>
          ) : (
            <div className="space-y-2" data-testid="picklists-wave-list">
              {waves.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWaveId(w.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    selectedWaveId === w.id
                      ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)]'
                      : 'border-[var(--app-border)] hover:bg-[var(--brand-ultra)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--text)]">{w.waveNumber}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {w.orderCount} orders · {w.itemsPicked}/{w.itemCount} lines picked
                      </p>
                    </div>
                    <Badge variant={w.status === 'PICKED' ? 'default' : 'secondary'}>
                      {waveStatusLabel(w.status)}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selectedWaveId && (
        <section
          className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]"
          data-testid="picklists-checklist"
        >
          <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
            <div className={splitRowClass}>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {wave?.waveNumber ?? 'Pick checklist'}
                </h3>
                <p className="text-xs text-[var(--text-mid)]">
                  Enter picked quantities for each line
                </p>
              </div>
              {canManage && wave && wave.status !== 'PICKED' && (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  disabled={!allItemsPicked || isCompleting}
                  onClick={handleComplete}
                  data-testid="complete-pick-wave"
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden />
                  {isCompleting ? 'Completing…' : 'Complete picking'}
                </Button>
              )}
            </div>
          </header>
          <div className="p-4 sm:p-5">
            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
            ) : detailError ? (
              <div className="py-8 text-center" role="alert">
                <p className="text-sm text-[var(--text-muted)]">Could not load wave detail.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => refetchDetail()}
                >
                  Retry
                </Button>
              </div>
            ) : !wave?.pickLists?.length ? (
              <p className="text-sm text-[var(--text-muted)]">No pick lists in this wave.</p>
            ) : (
              <div className="space-y-6">
                {wave.pickLists.map((pickList) => (
                  <article
                    key={pickList.id}
                    className="rounded-lg border border-[var(--app-border)] p-4"
                    data-testid={`pick-list-${pickList.id}`}
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-[var(--text)]">
                          {pickList.restaurantName}
                          {pickList.orderLabel ? ` · #${pickList.orderLabel}` : ''}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {pickList.warehouseName || 'Warehouse'} · {pickList.itemsPicked}/
                          {pickList.itemCount} picked
                        </p>
                      </div>
                      <Badge variant={pickList.status === 'COMPLETED' ? 'default' : 'secondary'}>
                        {pickList.status}
                      </Badge>
                    </div>
                    <ul className="space-y-3">
                      {pickList.items.map((item) => {
                        const isDone = item.quantityPicked != null
                        const draft =
                          pickedDraft[item.id] ??
                          (item.quantityPicked != null
                            ? String(item.quantityPicked)
                            : String(item.quantityOrdered))
                        return (
                          <li
                            key={item.id}
                            className="flex flex-col gap-2 rounded-md bg-[var(--brand-ultra)] p-3 sm:flex-row sm:items-center"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <Checkbox
                                checked={isDone}
                                disabled
                                aria-label={`${item.productName} picked`}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <p className="font-medium text-sm text-[var(--text)]">
                                  {item.productName}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {item.productSku || '—'}
                                  {item.locationCode ? ` · ${item.locationCode}` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:shrink-0">
                              <Label
                                htmlFor={`picked-${item.id}`}
                                className="text-xs text-[var(--text-muted)]"
                              >
                                Qty
                              </Label>
                              <Input
                                id={`picked-${item.id}`}
                                type="number"
                                min={0}
                                step="any"
                                className="h-8 w-20"
                                value={draft}
                                disabled={!canManage || wave.status === 'PICKED'}
                                onChange={(e) =>
                                  setPickedDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                              />
                              <span className="text-xs text-[var(--text-muted)] tabular-nums">
                                / {item.quantityOrdered}
                              </span>
                              {canManage && wave.status !== 'PICKED' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isUpdating}
                                  onClick={() =>
                                    handleSaveItem(pickList.id, item.id, item.quantityOrdered)
                                  }
                                >
                                  Save
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
