import { useState } from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { DealBoostPackagePicker } from './DealBoostPackagePicker'
import { useSubmitPromotionMutation } from '../../services/api'
import { Send } from 'lucide-react'
import toast from 'react-hot-toast'

export function SubmitDealDialog({
  dealId,
  dealName,
  open,
  onOpenChange,
  onSuccess,
}: {
  dealId: string | null
  dealName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const [pricingKey, setPricingKey] = useState('')
  const [submitDeal, { isLoading }] = useSubmitPromotionMutation()

  const handleSubmit = async () => {
    if (!dealId || !pricingKey) {
      toast.error('Select a boost package')
      return
    }
    try {
      await submitDeal({ id: dealId, pricingKey }).unwrap()
      toast.success('Deal and boost submitted for approval')
      onOpenChange(false)
      onSuccess?.()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to submit deal')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit for approval</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">
          {dealName
            ? `Choose how to boost "${dealName}" before admin review. Approval publishes your deal to restaurants.`
            : 'Choose a boost package before admin review. Approval publishes your deal to restaurants.'}
        </p>
        <DealBoostPackagePicker selectedPricingKey={pricingKey} onSelect={setPricingKey} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !pricingKey}>
            <Send className="h-4 w-4 mr-2" />
            Submit for approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
