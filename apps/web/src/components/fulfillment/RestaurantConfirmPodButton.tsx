import { CheckCircle, Loader2 } from 'lucide-react'
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
  const { data, isLoading: loadingPod } = useGetOrderProofOfDeliveryQuery(orderId)
  const [confirmPod, { isLoading: confirming }] = useConfirmOrderProofOfDeliveryMutation()

  const proof = data?.proof
  const canConfirm = proof && !proof.confirmed_at

  if (loadingPod || !canConfirm) return null

  const handleConfirm = async () => {
    try {
      await confirmPod(orderId).unwrap()
      toast.success('Proof of delivery confirmed')
    } catch (error: unknown) {
      const msg = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Failed to confirm proof of delivery')
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
      Confirm proof of delivery
    </Button>
  )
}
