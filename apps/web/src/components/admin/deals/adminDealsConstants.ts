export const DEAL_STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'deals.statusOptions.all' },
  { value: 'pending_review', labelKey: 'deals.statusOptions.pending_review' },
  { value: 'draft', labelKey: 'deals.statusOptions.draft' },
  { value: 'pending_approval', labelKey: 'deals.statusOptions.pending_approval' },
  { value: 'pending_admin_approval', labelKey: 'deals.statusOptions.pending_admin_approval' },
  { value: 'rejected', labelKey: 'deals.statusOptions.rejected' },
  { value: 'approved_pending_payment', labelKey: 'deals.statusOptions.approved_pending_payment' },
  { value: 'scheduled', labelKey: 'deals.statusOptions.scheduled' },
  { value: 'active', labelKey: 'deals.statusOptions.active' },
  { value: 'paused', labelKey: 'deals.statusOptions.paused' },
  { value: 'expired', labelKey: 'deals.statusOptions.expired' },
  { value: 'cancelled', labelKey: 'deals.statusOptions.cancelled' },
]

export const DEAL_TYPE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'deals.typeOptions.all' },
  { value: 'percentage_off', labelKey: 'deals.typeOptions.percentage_off' },
  { value: 'fixed_off', labelKey: 'deals.typeOptions.fixed_off' },
  { value: 'bogo', labelKey: 'deals.typeOptions.bogo' },
  { value: 'bundle', labelKey: 'deals.typeOptions.bundle' },
  { value: 'free_shipping', labelKey: 'deals.typeOptions.free_shipping' },
]

export const DEAL_QUICK_STATUS_FILTERS: { value: string; labelKey: string }[] = [
  { value: '', labelKey: 'common.all' },
  { value: 'active', labelKey: 'deals.statusOptions.active' },
  { value: 'pending_review', labelKey: 'deals.statusOptions.pending_review' },
  { value: 'expired', labelKey: 'deals.statusOptions.expired' },
]

export const DEAL_PAGE_SIZES = [10, 25, 50] as const
