import { CheckCircle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import {
  useConfirmOrderProofOfDeliveryMutation,
  useGetOrderProofOfDeliveryQuery,
} from '../../services/api'

type Props = {
  orderId: string
  className?: string
  fullWidth?: boolean
}

export function RestaurantConfirmPodButton({ orderId, className, fullWidth }: Props) {
  const { t } = useTranslation('fulfillment')
  const { data, isLoading: loadingPod } = useGetOrderProofOfDeliveryQuery(orderId)
  const [confirmPod, { isLoading: confirming }] = useConfirmOrderProofOfDeliveryMutation()

  const proof = data?.proof
  const canConfirm = proof && !proof.confirmed_at

  if (loadingPod || !canConfirm) return null

  const handleConfirm = async () => {
    try {
      await confirmPod(orderId).unwrap()
      toast.success(t('pod.toast.confirmed'))
    } catch (error: unknown) {
      const msg = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('pod.toast.confirmFailed'))
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={fullWidth ? `w-full ${className ?? ''}` : className}
      disabled={confirming}
      onClick={handleConfirm}
      data-testid="restaurant-confirm-pod"
    >
      {confirming ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CheckCircle className="mr-2 h-4 w-4" />
      )}
      {t('pod.confirmButton')}
    </Button>
  )
}
