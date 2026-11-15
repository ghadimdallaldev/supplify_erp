export type ReservationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'WAITLIST'
  | 'NO_SHOW'

export type ReservationBookingSource = 'staff' | 'public' | 'walk_in'

export interface ReservationTable {
  id: string
  restaurant_id: string
  branch_id?: string | null
  name: string
  capacity: number
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
  booking_source?: ReservationBookingSource
  waitlist: boolean
  auto_confirmed: boolean
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
}

export interface ReservationBoardResponse {
  day: string
  tables: ReservationTable[]
  reservations: Reservation[]
  waitlist: ReservationWaitlist[]
}
