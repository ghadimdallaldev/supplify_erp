import { FormEvent, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { PageHeader } from '../../components/ui/page-header'
import { RequirePermission } from '../../components/RequirePermission'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Switch } from '../../components/ui/switch'
import { Skeleton } from '../../components/ui/skeleton'
import {
  useGetConsumerLoyaltyProgramQuery,
  useUpsertConsumerLoyaltyProgramMutation,
} from '../../services/consumerApi'
import { toast } from 'sonner'

export function ConsumerLoyaltyPage() {
  const { data, isLoading } = useGetConsumerLoyaltyProgramQuery()
  const [saveProgram, { isLoading: saving }] = useUpsertConsumerLoyaltyProgramMutation()

  const program = data?.program
  const [form, setForm] = useState({
    name: 'Rewards',
    enabled: false,
    earnPointsPerCurrency: '1',
    redeemCurrencyPerPoint: '0.01',
    minRedeemPoints: '50',
    welcomeBonusPoints: '0',
    maxRedeemPercent: '50',
    takeawayMultiplier: '1',
    deliveryMultiplier: '1.25',
    dineInMultiplier: '1.5',
  })

  useEffect(() => {
    if (!program) return
    const multipliers = program.rules_json?.fulfillment_multipliers ?? {}
    setForm({
      name: program.name ?? 'Rewards',
      enabled: program.enabled ?? false,
      earnPointsPerCurrency: String(program.earn_points_per_currency ?? 1),
      redeemCurrencyPerPoint: String(program.redeem_currency_per_point ?? 0.01),
      minRedeemPoints: String(program.min_redeem_points ?? 50),
      welcomeBonusPoints: String(program.welcome_bonus_points ?? 0),
      maxRedeemPercent: String(program.max_redeem_percent ?? 50),
      takeawayMultiplier: String(multipliers.TAKEAWAY ?? multipliers.pickup ?? 1),
      deliveryMultiplier: String(multipliers.DELIVERY ?? multipliers.delivery ?? 1.25),
      dineInMultiplier: String(multipliers.DINE_IN ?? multipliers.dine_in ?? 1.5),
    })
  }, [program])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await saveProgram({
        name: form.name.trim(),
        enabled: form.enabled,
        earnPointsPerCurrency: Number(form.earnPointsPerCurrency),
        redeemCurrencyPerPoint: Number(form.redeemCurrencyPerPoint),
        minRedeemPoints: Number(form.minRedeemPoints),
        welcomeBonusPoints: Number(form.welcomeBonusPoints),
        maxRedeemPercent: Number(form.maxRedeemPercent),
        rulesJson: {
          fulfillment_multipliers: {
            TAKEAWAY: Number(form.takeawayMultiplier),
            DELIVERY: Number(form.deliveryMultiplier),
            DINE_IN: Number(form.dineInMultiplier),
            pickup: Number(form.takeawayMultiplier),
            delivery: Number(form.deliveryMultiplier),
            dine_in: Number(form.dineInMultiplier),
          },
        },
      }).unwrap()
      toast.success('Diner rewards program saved')
    } catch (error: any) {
      toast.error(error?.data?.message || error?.data?.error?.message || 'Unable to save program')
    }
  }

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <div className="space-y-6">
        <PageHeader
          title="Diner Rewards"
          description="Configure earn rates, redemption, welcome bonus, and fulfillment multipliers."
        />

        {isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Program settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor="enabled">Program enabled</Label>
                    <p className="text-sm text-muted-foreground">
                      When off, diners cannot earn or redeem points.
                    </p>
                  </div>
                  <Switch
                    id="enabled"
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="name">Program name</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="welcomeBonus">Welcome bonus (points)</Label>
                    <Input
                      id="welcomeBonus"
                      type="number"
                      min={0}
                      value={form.welcomeBonusPoints}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, welcomeBonusPoints: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="earnRate">Earn points per $1 (subtotal)</Label>
                    <Input
                      id="earnRate"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.earnPointsPerCurrency}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, earnPointsPerCurrency: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="redeemRate">Redeem value per point ($)</Label>
                    <Input
                      id="redeemRate"
                      type="number"
                      min={0}
                      step="0.001"
                      value={form.redeemCurrencyPerPoint}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, redeemCurrencyPerPoint: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="minRedeem">Minimum redeem (points)</Label>
                    <Input
                      id="minRedeem"
                      type="number"
                      min={0}
                      value={form.minRedeemPoints}
                      onChange={(e) => setForm((f) => ({ ...f, minRedeemPoints: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="maxRedeem">Max redeem (% of subtotal)</Label>
                    <Input
                      id="maxRedeem"
                      type="number"
                      min={0}
                      max={100}
                      value={form.maxRedeemPercent}
                      onChange={(e) => setForm((f) => ({ ...f, maxRedeemPercent: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-medium">Fulfillment earn multipliers</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="takeawayMult">Takeaway</Label>
                      <Input
                        id="takeawayMult"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.takeawayMultiplier}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, takeawayMultiplier: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="deliveryMult">Delivery</Label>
                      <Input
                        id="deliveryMult"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.deliveryMultiplier}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, deliveryMultiplier: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dineInMult">Dine-in</Label>
                      <Input
                        id="dineInMult"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.dineInMultiplier}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, dineInMultiplier: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save program'}
                </Button>
              </CardContent>
            </Card>
          </form>
        )}
      </div>
    </RequirePermission>
  )
}
