import { describe, expect, it } from 'vitest'
import {
  entersCapacity,
  resolveHostBookingStatus,
  getReservationStatusChange,
  getReservationTransitionError,
  leavesNoShow,
} from './reservation-status.js'

describe('reservation status changes', () => {
  it('rejects leaving a completed visit', () => {
    expect(getReservationTransitionError('COMPLETED', 'SEATED')).toMatch(/completed/i)
  })

  it('allows restoring a no-show to confirmed', () => {
    expect(getReservationTransitionError('NO_SHOW', 'CONFIRMED')).toBeNull()
  })

  it('requires a restore step before seating a cancelled booking', () => {
    expect(getReservationTransitionError('CANCELLED', 'SEATED')).toMatch(/confirmed/i)
  })

  it('holds a seated party as pending when the room is already busy', () => {
    expect(resolveHostBookingStatus({ seated: true, utilization: 0.2 })).toBe('CONFIRMED')
    expect(resolveHostBookingStatus({ seated: true, utilization: 0.9 })).toBe('PENDING')
    expect(resolveHostBookingStatus({ seated: false, utilization: 0.2 })).toBe('WAITLIST')
  })

  it('treats a restore as taking a seat again', () => {
    expect(entersCapacity('NO_SHOW', 'CONFIRMED')).toBe(true)
    expect(entersCapacity('CANCELLED', 'PENDING')).toBe(true)
    expect(entersCapacity('CONFIRMED', 'SEATED')).toBe(false)
    expect(leavesNoShow('NO_SHOW', 'CONFIRMED')).toBe(true)
    expect(leavesNoShow('CONFIRMED', 'NO_SHOW')).toBe(false)
  })

  it('records a visit only the first time a booking is completed', () => {
    expect(getReservationStatusChange('SEATED', 'COMPLETED').recordVisit).toBe(true)
    expect(getReservationStatusChange('COMPLETED', 'COMPLETED').recordVisit).toBe(false)
    expect(getReservationStatusChange('CONFIRMED', 'CONFIRMED').notifyGuest).toBe(false)
    expect(getReservationStatusChange('CONFIRMED', 'CANCELLED').promoteWaitlist).toBe(true)
  })
})
