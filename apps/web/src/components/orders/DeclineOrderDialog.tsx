import { useState } from 'react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'

type DeclineOrderDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => Promise<void>
  orderLabel?: string
  isSubmitting?: boolean
}

export function DeclineOrderDialog({
  open,
  onOpenChange,
  onConfirm,
  orderLabel,
  isSubmitting = false,
}: DeclineOrderDialogProps) {
  const [reason, setReason] = useState('')

  const handleClose = (next: boolean) => {
    if (!isSubmitting) {
      onOpenChange(next)
      if (!next) setReason('')
    }
  }

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (trimmed.length < 3) return
    await onConfirm(trimmed)
    setReason('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline order</DialogTitle>
          <DialogDescription>
            {orderLabel
              ? `Tell ${orderLabel} why you cannot fulfill this order. They will see your message on the order.`
              : 'Provide a reason the restaurant will see on this order.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="decline-reason">Reason (required)</Label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Out of stock for key items until next week"
            rows={4}
            maxLength={2000}
            disabled={isSubmitting}
          />
          <p className="text-xs text-[var(--text-muted)]">Minimum 3 characters.</p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || reason.trim().length < 3}
          >
            {isSubmitting ? 'Declining…' : 'Decline order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
