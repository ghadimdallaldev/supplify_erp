import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { Button } from '../ui/button'
import { useFollowSupplier } from '../../hooks/useFollowSupplier'

type Props = {
  suppliers: Array<{ id: string; name: string | null }>
  onFollowed: (supplierId: string) => void
}

/**
 * Checkout answered FOLLOW_REQUIRED (spec §11.3.1): one row per supplier the restaurant no
 * longer follows, with "Follow & keep in cart". Items stay in the cart until removed.
 */
export function FollowRequiredPanel({ suppliers, onFollowed }: Props) {
  const { t } = useTranslation('common')
  const { follow } = useFollowSupplier()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (suppliers.length === 0) return null

  const handleFollow = async (supplierId: string) => {
    setBusyId(supplierId)
    try {
      if ((await follow(supplierId)) === 'followed') onFollowed(supplierId)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg border border-[var(--warning-border,var(--app-border))] bg-[var(--warning-bg,var(--surface))] p-4"
      data-testid="follow-required-panel"
    >
      <div>
        <p className="font-medium text-[var(--text)]">{t('marketplace.followRequiredTitle')}</p>
        <p className="mt-1 text-sm text-[var(--text-mid)]">{t('marketplace.followRequiredBody')}</p>
      </div>
      <ul className="space-y-2">
        {suppliers.map((supplier) => (
          <li
            key={supplier.id}
            data-testid={`follow-required-row-${supplier.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2"
          >
            <span className="min-w-0 truncate font-medium">{supplier.name}</span>
            <Button
              size="sm"
              onClick={() => handleFollow(supplier.id)}
              disabled={busyId === supplier.id}
            >
              <UserPlus className="me-1 h-4 w-4" aria-hidden />
              {t('marketplace.followAndKeepInCart')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
