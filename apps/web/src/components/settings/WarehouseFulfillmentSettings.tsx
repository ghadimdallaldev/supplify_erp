import { useState } from 'react'
import {
  useGetSupplierFulfillmentQuery,
  useUpdateSupplierFulfillmentMutation,
  useGetWarehouseRoutingRulesQuery,
  useSimulateWarehouseRoutingMutation,
} from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Input } from '../ui/input'
import { toast } from 'sonner'
import { Route, Loader2 } from 'lucide-react'

type Props = {
  enabled: boolean
}

export function WarehouseFulfillmentSettings({ enabled }: Props) {
  const { data, isLoading } = useGetSupplierFulfillmentQuery(undefined, { skip: !enabled })
  const [updateFulfillment, { isLoading: saving }] = useUpdateSupplierFulfillmentMutation()
  const { data: rulesData } = useGetWarehouseRoutingRulesQuery(undefined, { skip: !enabled })
  const [simulateRouting, { isLoading: simulating }] = useSimulateWarehouseRoutingMutation()
  const [simulateArea, setSimulateArea] = useState('')

  const fulfillment = data?.fulfillment

  const handleToggleMulti = async (checked: boolean) => {
    try {
      await updateFulfillment({ multi_warehouse_enabled: checked }).unwrap()
      toast.success(checked ? 'Multi-warehouse enabled' : 'Multi-warehouse disabled')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Failed to update fulfillment settings')
    }
  }

  const handleSimulate = async () => {
    try {
      const result = await simulateRouting({ deliveryArea: simulateArea || undefined }).unwrap()
      toast.success(
        result?.warehouseName ? `Would route to: ${result.warehouseName}` : 'Simulation complete'
      )
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Simulation failed')
    }
  }

  if (!enabled) return null
  if (isLoading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4" />
          Fulfillment mode
        </CardTitle>
        <CardDescription>
          Enable multi-warehouse dispatch and preview routing rules (Gold+)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="multi-warehouse">Multi-warehouse dispatch</Label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Assign orders to warehouses automatically or manually
            </p>
          </div>
          <Switch
            id="multi-warehouse"
            checked={Boolean(fulfillment?.multi_warehouse_enabled)}
            disabled={saving}
            onCheckedChange={handleToggleMulti}
          />
        </div>
        {(rulesData?.rules?.length ?? 0) > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-2">Active routing rules ({rulesData.rules.length})</p>
            <ul className="space-y-1 text-[var(--text-muted)]">
              {rulesData.rules.slice(0, 5).map((rule: { id: string; name?: string }) => (
                <li key={rule.id}>{rule.name || rule.id.slice(0, 8)}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="simulate-area">Simulate routing (delivery area)</Label>
            <Input
              id="simulate-area"
              className="mt-1"
              placeholder="e.g. Downtown"
              value={simulateArea}
              onChange={(e) => setSimulateArea(e.target.value)}
            />
          </div>
          <Button variant="outline" disabled={simulating} onClick={handleSimulate}>
            {simulating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simulate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
