import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Input } from '../../ui/input'
import {
  useGetAdminPromotionPricingQuery,
  useUpdateAdminPromotionPricingMutation,
} from '../../../services/api'
import { ADMIN_BOOST_PACKAGES_EMPTY } from '../../../lib/dealDisplayLabels'
import { AdminEmptyState, AdminSectionHeader } from '../adminUi'

export function AdminDealsBoostSection() {
  const { data: pricingData, refetch: refetchPricing } = useGetAdminPromotionPricingQuery()
  const [updatePricing, { isLoading: savingPricing }] = useUpdateAdminPromotionPricingMutation()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    amount: '',
    durationDays: '',
    displayName: '',
    description: '',
    estimatedReachLabel: '',
    badgeLabel: '',
    isRecommended: false,
    isActive: true,
  })

  const pricing = pricingData?.pricing || []
  const boostPackages = pricing.filter(
    (t) =>
      String(t.package_type || '') === 'boost' || String(t.pricing_key || '').startsWith('boost_')
  )
  const activationPricing = pricing.find((t) => String(t.pricing_key) === 'deal_activation')

  const startEditPricing = (tier: Record<string, unknown>) => {
    const key = String(tier.pricing_key)
    setEditingKey(key)
    setEditForm({
      amount: String(tier.amount ?? ''),
      durationDays: tier.duration_days != null ? String(tier.duration_days) : '',
      displayName: String(tier.display_name || ''),
      description: String(tier.description || ''),
      estimatedReachLabel: String(tier.estimated_reach_label || ''),
      badgeLabel: String(tier.badge_label || ''),
      isRecommended: Boolean(tier.is_recommended),
      isActive: tier.is_active !== false,
    })
  }

  const savePricing = async (key: string) => {
    try {
      await updatePricing({
        key,
        amount: Number(editForm.amount),
        durationDays: editForm.durationDays ? Number(editForm.durationDays) : null,
        displayName: editForm.displayName || undefined,
        description: editForm.description || null,
        estimatedReachLabel: editForm.estimatedReachLabel || null,
        badgeLabel: editForm.badgeLabel || null,
        isRecommended: editForm.isRecommended,
        isActive: editForm.isActive,
      }).unwrap()
      toast.success('Boost package updated')
      setEditingKey(null)
      refetchPricing()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to update pricing')
    }
  }

  return (
    <>
      <AdminSectionHeader
        title="Boost packages & activation"
        description="Configure boost packages suppliers see when boosting deals for sponsored placement. Price changes apply to new purchases only — existing boosts keep the amount paid at checkout."
      />

      {activationPricing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deal activation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{String(activationPricing.display_name)}</p>
            <p className="mt-1 text-[var(--text-muted)]">
              {String(activationPricing.description || '')}
            </p>
            <p className="mt-2 font-semibold tabular-nums">
              ${Number(activationPricing.amount).toFixed(2)}
              {Number(activationPricing.amount) === 0 ? (
                <span className="ml-2 text-xs font-normal text-emerald-700">
                  · {String(activationPricing.badge_label || 'Free after admin approval')}
                </span>
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boost packages</CardTitle>
        </CardHeader>
        <CardContent>
          {boostPackages.length === 0 ? (
            <AdminEmptyState
              title={ADMIN_BOOST_PACKAGES_EMPTY.title}
              description={ADMIN_BOOST_PACKAGES_EMPTY.description}
            />
          ) : (
            <div className="space-y-3">
              {boostPackages.map((tier) => {
                const key = String(tier.pricing_key)
                const isEditing = editingKey === key
                return (
                  <div key={key} className="space-y-3 rounded-lg border p-4">
                    {isEditing ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--text-muted)]">Display name</span>
                          <Input
                            value={editForm.displayName}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, displayName: e.target.value }))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--text-muted)]">Price ($)</span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={editForm.amount}
                            onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--text-muted)]">Duration (days)</span>
                          <Input
                            type="number"
                            min={1}
                            value={editForm.durationDays}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, durationDays: e.target.value }))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-[var(--text-muted)]">Badge label</span>
                          <Input
                            value={editForm.badgeLabel}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, badgeLabel: e.target.value }))
                            }
                            placeholder="Most popular"
                          />
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="text-[var(--text-muted)]">Description</span>
                          <Input
                            value={editForm.description}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, description: e.target.value }))
                            }
                          />
                        </label>
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="text-[var(--text-muted)]">Estimated reach label</span>
                          <Input
                            value={editForm.estimatedReachLabel}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, estimatedReachLabel: e.target.value }))
                            }
                            placeholder="Higher placement for 7 days"
                          />
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.isRecommended}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, isRecommended: e.target.checked }))
                            }
                          />
                          Recommended package
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.isActive}
                            onChange={(e) =>
                              setEditForm((f) => ({ ...f, isActive: e.target.checked }))
                            }
                          />
                          Active (available for purchase)
                        </label>
                        <div className="flex gap-2 sm:col-span-2">
                          <Button
                            size="sm"
                            onClick={() => savePricing(key)}
                            disabled={savingPricing}
                          >
                            Save package
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{String(tier.display_name)}</p>
                            {tier.badge_label ? (
                              <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-xs">
                                {String(tier.badge_label)}
                              </span>
                            ) : null}
                            {tier.is_recommended ? (
                              <span className="text-xs text-[var(--brand)]">Recommended</span>
                            ) : null}
                            {tier.is_active === false ? (
                              <span className="text-xs text-[var(--red)]">Inactive</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            {tier.duration_days
                              ? `${tier.duration_days} day(s)`
                              : 'No fixed duration'}
                            {tier.estimated_reach_label
                              ? ` · ${String(tier.estimated_reach_label)}`
                              : ''}
                          </p>
                          <p className="mt-1 max-w-xl text-xs text-[var(--text-muted)]">
                            {String(tier.description || '')}
                          </p>
                          <p className="mt-2 font-mono text-[10px] text-[var(--text-muted)]">
                            {key}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold tabular-nums">
                            ${Number(tier.amount).toFixed(2)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditPricing(tier)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
