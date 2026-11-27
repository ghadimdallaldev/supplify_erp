import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useFollowSupplierMutation, useUnblockSupplierMutation } from '../services/api'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { apiErrorMessage, apiErrorName } from '../lib/relationshipErrors'
import { useAppDispatch } from './redux'

export type FollowOutcome = 'followed' | 'limit' | 'blocked' | 'failed'

const UPGRADE_URL = '/app/settings?tab=subscription'

/**
 * Follow a supplier with the marketplace error contract handled in one place:
 * - SUPPLIER_FOLLOW_LIMIT_REACHED → the plan upgrade prompt;
 * - SUPPLIER_BLOCKED → "Unblock to follow", with an Unblock action that unblocks and follows;
 * - anything else → the API message.
 */
export function useFollowSupplier() {
  const { t } = useTranslation('common')
  const dispatch = useAppDispatch()
  const [followSupplier] = useFollowSupplierMutation()
  const [unblockSupplier] = useUnblockSupplierMutation()
  const [pending, setPending] = useState<string | null>(null)

  const follow = useCallback(
    async (supplierId: string): Promise<FollowOutcome> => {
      setPending(supplierId)
      try {
        await followSupplier(supplierId).unwrap()
        return 'followed'
      } catch (error) {
        const name = apiErrorName(error)
        if (name === 'SUPPLIER_FOLLOW_LIMIT_REACHED') {
          openBrowseUpgrade(dispatch, { upgradeUrl: UPGRADE_URL })
          return 'limit'
        }
        if (name === 'SUPPLIER_BLOCKED') {
          toast.error(t('marketplace.unblockToFollow'), {
            action: {
              label: t('marketplace.unblock'),
              onClick: async () => {
                try {
                  await unblockSupplier(supplierId).unwrap()
                  await followSupplier(supplierId).unwrap()
                  toast.success(t('marketplace.followed'))
                } catch (retryError) {
                  toast.error(apiErrorMessage(retryError) || t('marketplace.followFailed'))
                }
              },
            },
          })
          return 'blocked'
        }
        toast.error(apiErrorMessage(error) || t('marketplace.followFailed'))
        return 'failed'
      } finally {
        setPending(null)
      }
    },
    [dispatch, followSupplier, t, unblockSupplier]
  )

  return { follow, pendingSupplierId: pending }
}
