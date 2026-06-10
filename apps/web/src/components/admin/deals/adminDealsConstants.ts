export const DEAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending approval' },
  { value: 'pending_admin_approval', label: 'Pending admin approval' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved_pending_payment', label: 'Pending payment' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const DEAL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All types' },
  { value: 'percentage_off', label: 'Percentage off' },
  { value: 'fixed_off', label: 'Fixed discount' },
  { value: 'bogo', label: 'Buy one get one' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'free_shipping', label: 'Free shipping' },
]

export const DEAL_QUICK_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'expired', label: 'Expired' },
]

export const DEAL_PAGE_SIZES = [10, 25, 50] as const
