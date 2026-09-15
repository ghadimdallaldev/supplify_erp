export type DisputeResolutionType = 'credit_note' | 'replacement' | 'refund' | 'no_action'

export interface DisputeResolutionRequest {
  resolutionType: DisputeResolutionType
  resolutionNotes?: string
  creditNoteAmount?: number
  creditNoteNotes?: string
  refundAmount?: number
  refundReference?: string
}

export interface DisputeResolutionEffect {
  id: string
  dispute_id: string
  effect_type: DisputeResolutionType
  amount?: number | string | null
  currency?: string | null
  reference?: string | null
  credit_note_id?: string | null
  replacement_order_id?: string | null
  effect_data?: Record<string, unknown>
  created_at?: string
}

export interface DisputeDetailResponse {
  dispute: Record<string, unknown>
  items?: Array<Record<string, unknown>>
  attachments?: Array<Record<string, unknown>>
  creditNotes?: Array<Record<string, unknown>>
  replacementOrder?: Record<string, unknown> | null
  resolutionEffect?: DisputeResolutionEffect | null
}
