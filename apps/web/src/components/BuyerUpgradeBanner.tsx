import { Button } from './ui/button'
import { useSupplifyModel } from '../hooks/useSupplifyModel'
import { useUpgradeRestaurantWorkspaceMutation } from '../services/api'
import toast from 'react-hot-toast'

type Props = {
  className?: string
}

export function BuyerUpgradeBanner({ className = '' }: Props) {
  const { isV2, config } = useSupplifyModel()
  const [upgrade, { isLoading }] = useUpgradeRestaurantWorkspaceMutation()

  if (!isV2) return null

  const restaurant = config.restaurant as {
    upgradeHeadline?: string
    upgradeBody?: string
  }

  const handleUpgrade = async () => {
    try {
      await upgrade().unwrap()
      toast.success('Upgraded to full restaurant workspace')
      window.location.reload()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message || 'Upgrade failed'
      toast.error(msg)
    }
  }

  return (
    <div
      className={`rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-4 ${className}`}
    >
      <h3 className="font-semibold text-[var(--text-primary)]">
        {restaurant.upgradeHeadline ?? 'Upgrade to a full restaurant workspace'}
      </h3>
      <p className="text-sm text-[var(--text-muted)] mt-1">
        {restaurant.upgradeBody ??
          'Unlock multi-supplier operations, staff, reservations, and analytics.'}
      </p>
      <Button className="mt-3" size="sm" onClick={handleUpgrade} disabled={isLoading}>
        {isLoading ? 'Upgrading…' : 'Upgrade workspace'}
      </Button>
    </div>
  )
}
