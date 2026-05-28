import { useState } from 'react'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { useGetPromotionPricingQuery, usePromoteDealMutation } from '../../services/api'
import { Megaphone } from 'lucide-react'
import toast from 'react-hot-toast'

export function PromoteDealDialog({
  dealId,
  open,
  onOpenChange,
  onSuccess,
}: {
  dealId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const [selectedPricingKey, setSelectedPricingKey] = useState('boost_flat')
  const { data: pricingData } = useGetPromotionPricingQuery(undefined, { skip: !open })
  const [promoteDeal, { isLoading }] = usePromoteDealMutation()
  const pricingOptions = pricingData?.pricing || []

  const handlePromote = async () => {
    if (!dealId) return
    try {
      await promoteDeal({ id: dealId, pricingKey: selectedPricingKey }).unwrap()
      toast.success('Deal boost activated')
      onOpenChange(false)
      onSuccess?.()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Failed to boost deal')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Boost deal</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">
          Show this deal to restaurants that do not follow you. Payment integration is prepared;
          boosts are free until billing is connected.
        </p>
        <div className="space-y-2 mt-2">
          {pricingOptions.map((opt) => (
            <label
              key={String(opt.pricing_key)}
              className={`flex items-center justify-between border rounded-lg p-3 cursor-pointer ${
                selectedPricingKey === opt.pricing_key ? 'border-[var(--brand)]' : ''
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="pricing"
                  checked={selectedPricingKey === opt.pricing_key}
                  onChange={() => setSelectedPricingKey(String(opt.pricing_key))}
                />
                <div>
                  <p className="font-medium text-sm">{String(opt.display_name)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {String(opt.description || '')}
                  </p>
                </div>
              </div>
              <span className="font-semibold">${Number(opt.amount).toFixed(2)}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={handlePromote} disabled={isLoading}>
            <Megaphone className="h-4 w-4 mr-2" />
            Activate boost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
