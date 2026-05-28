import { useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminSubscriptionAddonsQuery,
  useUpsertAdminSubscriptionAddonMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { AdminEmptyState, AdminLoadingState, AdminStatusBadge } from './adminUi'

const SUPPLIER_ADDON_OPTIONS = [
  { key: 'supplier_extra_branch', label: 'Extra branch' },
  { key: 'supplier_extra_warehouse', label: 'Extra warehouse' },
]

const RESTAURANT_ADDON_OPTIONS = [{ key: 'restaurant_extra_branch', label: 'Extra branch' }]

export function AdminLocationAddonsPanel() {
  const [tenantType, setTenantType] = useState<'RESTAURANT' | 'SUPPLIER'>('RESTAURANT')
  const [tenantId, setTenantId] = useState('')
  const [addonKey, setAddonKey] = useState('restaurant_extra_branch')
  const [quantity, setQuantity] = useState('1')
  const [reason, setReason] = useState('')

  const trimmedId = tenantId.trim()
  const { data, isLoading, isFetching, refetch } = useGetAdminSubscriptionAddonsQuery(
    { tenantType, tenantId: trimmedId },
    { skip: !trimmedId }
  )
  const [upsert, { isLoading: saving }] = useUpsertAdminSubscriptionAddonMutation()

  const addonOptions =
    tenantType === 'RESTAURANT' ? RESTAURANT_ADDON_OPTIONS : SUPPLIER_ADDON_OPTIONS
  const loc = data?.locationLimits
  const branches = loc?.branches
  const warehouses = loc?.warehouses

  const handleSave = async () => {
    if (!trimmedId) {
      toast.error('Enter a tenant ID')
      return
    }
    try {
      await upsert({
        tenantType,
        tenantId: trimmedId,
        addonKey,
        quantity: parseInt(quantity, 10) || 0,
        reason: reason || null,
      }).unwrap()
      toast.success('Add-on updated')
      refetch()
    } catch {
      toast.error('Failed to update add-on')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--text)]">Branch & warehouse add-ons</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Grant paid add-ons manually (billing integration later). Applies to the org billing tenant
          (main branch). Effective limits = included plan limit + add-on quantity + any limit
          overrides.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Look up tenant</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label>Tenant type</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={tenantType}
              onChange={(e) => {
                const t = e.target.value as 'RESTAURANT' | 'SUPPLIER'
                setTenantType(t)
                setAddonKey(
                  t === 'RESTAURANT' ? 'restaurant_extra_branch' : 'supplier_extra_branch'
                )
              }}
            >
              <option value="RESTAURANT">Restaurant</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Tenant ID (UUID)</Label>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Main branch tenant UUID"
            />
          </div>
        </CardContent>
      </Card>

      {trimmedId && isLoading && <AdminLoadingState label="Loading usage and add-ons…" />}

      {trimmedId && !isLoading && data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Usage vs limits</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {branches && (
                <div className="rounded-lg border p-4">
                  <p className="font-medium">Branches</p>
                  <p className="text-[var(--text-muted)] mt-1">
                    Current: {branches.current} · Included: {branches.included ?? 'n/a'} · Add-ons:{' '}
                    {branches.addonQuantity} · Effective: {branches.effective ?? 'n/a'}
                  </p>
                  {branches.overIncludedLimit && !branches.overEffectiveLimit && (
                    <AdminStatusBadge tone="warning" className="mt-2">
                      Over included limit but within add-on / override cap
                    </AdminStatusBadge>
                  )}
                  {branches.overEffectiveLimit && (
                    <AdminStatusBadge tone="danger" className="mt-2">
                      Over effective limit — cannot add more until add-on or upgrade
                    </AdminStatusBadge>
                  )}
                  {branches.atEnterpriseThreshold && (
                    <AdminStatusBadge tone="danger" className="mt-2">
                      At Enterprise threshold (6+ branches) — contact sales
                    </AdminStatusBadge>
                  )}
                </div>
              )}
              {warehouses && (
                <div className="rounded-lg border p-4">
                  <p className="font-medium">Warehouses</p>
                  <p className="text-[var(--text-muted)] mt-1">
                    Current: {warehouses.current} · Included: {warehouses.included ?? 'n/a'} ·
                    Add-ons: {warehouses.addonQuantity} · Effective: {warehouses.effective ?? 'n/a'}
                  </p>
                  {warehouses.overIncludedLimit && !warehouses.overEffectiveLimit && (
                    <AdminStatusBadge tone="warning" className="mt-2">
                      Over included limit but within add-on cap
                    </AdminStatusBadge>
                  )}
                  {warehouses.overEffectiveLimit && (
                    <AdminStatusBadge tone="danger" className="mt-2">
                      Over effective warehouse limit
                    </AdminStatusBadge>
                  )}
                </div>
              )}
              <p className="text-[var(--text-muted)]">
                Billing tenant: <code className="text-xs">{data.billingTenantId}</code> · Plan:{' '}
                {data.planCode ?? '—'}
              </p>
              {(data.addons?.length ?? 0) > 0 && (
                <ul className="list-disc pl-5 text-[var(--text-muted)]">
                  {data.addons.map((a) => (
                    <li key={a.id}>
                      {a.addon_key}: {a.quantity} × ${a.unit_price_monthly ?? '—'}/mo
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Set add-on quantity</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Add-on</Label>
                <select
                  className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
                  value={addonKey}
                  onChange={(e) => setAddonKey(e.target.value)}
                >
                  {addonOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Quantity (0 = remove)</Label>
                <Input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  type="number"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Reason (optional)</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div>
                <Button onClick={handleSave} disabled={saving || isFetching}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save add-on
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {trimmedId && !isLoading && !data && (
        <AdminEmptyState message="No subscription data for this tenant." />
      )}
    </div>
  )
}
