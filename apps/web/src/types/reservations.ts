// Reservations types
export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WAITLIST'

export type ReservationTableShape = 'round' | 'square' | 'rectangle' | 'booth' | 'chef_table'
export type ReservationTableZone = 'main' | 'patio' | 'bar' | 'vip' | 'private'

export interface ReservationTableLayout {
  shape?: ReservationTableShape
  color?: string
  zone?: ReservationTableZone
  features?: string[]
  notes?: string
  rotation?: number
  width?: number
  height?: number
  widthRatio?: number
  heightRatio?: number
  [key: string]: unknown
}

export interface ReservationTable {
  id: string
  restaurant_id: string
  branch_id?: string | null
  name: string
  capacity: number
  layout?: ReservationTableLayout
  position?: { x?: number; y?: number }
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  restaurant_id: string
  branch_id?: string | null
  tables: string[]
  status: ReservationStatus
  customer_name: string
  customer_phone?: string | null
  customer_email?: string | null
  party_size: number
  scheduled_at: string
  duration_minutes: number
  notes?: string | null
  metadata?: Record<string, unknown>
  waitlist: boolean
  auto_confirmed: boolean
  created_by?: string | null
  created_at: string
  updated_at: string
}

export interface ReservationWaitlist {
  id: string
  restaurant_id: string
  branch_id?: string | null
  customer_name: string
  customer_phone?: string | null
  party_size: number
  requested_at: string
  preferred_time?: string | null
  notes?: string | null
  status: 'WAITING' | 'NOTIFIED' | 'SEATED' | 'CANCELLED'
  metadata?: Record<string, unknown>
}

export interface ReservationBoardResponse {
  day: string
  tables: ReservationTable[]
  reservations: Reservation[]
  waitlist: ReservationWaitlist[]
}

export interface ReservationAnalyticsResponse {
  periodStart: string
  slots: Array<{
    hour_slot: string
    confirmed: number
    cancelled: number
    waitlisted: number
    total_covers: number
  }>
  waitlist: Array<{ status: string; total: number }>
}
