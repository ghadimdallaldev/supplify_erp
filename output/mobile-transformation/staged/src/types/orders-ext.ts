export interface ProofOfDelivery {
  id: string
  order_id: string
  recipient_name?: string | null
  notes?: string | null
  file_key?: string | null
  signature_file_key?: string | null
  delivery_photo_url?: string | null
  signature_image_url?: string | null
  delivery_gps_lat?: number | null
  delivery_gps_lng?: number | null
  delivery_timestamp?: string
  confirmed_at?: string | null
}

export interface PresignedUrlResponse {
  presignedUrl?: string
  url?: string
  fileKey: string
  publicUrl?: string
}

export interface DispatchOrderCard {
  id: string
  status: string
  total_amount: number
  restaurant_name: string
  item_count: number
  delivery_area?: string | null
  delivery_status?: string | null
  scheduled_delivery_date?: string | null
  destination_label?: string | null
  destination_address?: unknown
  warehouse_id?: string | null
  warehouse_name?: string | null
  warehouse_code?: string | null
  warehouse_count?: number
  multi_warehouse?: boolean
  assignment?: {
    id: string
    driver_id?: string
    driver_name?: string
    status: string
    warehouse_assignment_id?: string | null
  } | null
}

export interface OrderAmendmentItem {
  id: string
  orderItemId?: string | null
  originalProductId?: string | null
  substituteProductId?: string | null
  originalQuantity?: number | null
  requestedQuantity?: number | null
  unitPrice?: number | null
  notes?: string | null
}

export interface OrderAmendment {
  id: string
  order_id: string
  requested_by_role: 'restaurant' | 'supplier'
  requested_by: string
  change_type?: string | null
  changeType?: string | null
  description: string
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled'
  response_notes?: string | null
  created_at: string
  items?: OrderAmendmentItem[]
}
