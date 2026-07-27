import { describe, it, expect } from 'vitest'
import {
  buildTimeSlots,
  calculateSlotsFromData,
  computeSeatsLeft,
  intervalsOverlap,
  reservationOverlapsSlot,
  findBookableSlot,
  toCalendarDateString,
  CAPACITY_CONSUMING_STATUSES,
} from './reservation-availability.js'

describe('reservation-availability', () => {
  const calendarDate = '2026-06-15'
  const testNow = new Date(2026, 5, 14, 12, 0, 0)
  const tables = [
    { capacity: 10, is_active: true },
    { capacity: 14, is_active: true },
  ]
  const totalCapacity = 24

  it('shows full capacity when no reservations exist', () => {
    const { slots, totalCapacity: cap } = calculateSlotsFromData({
      tables,
      reservations: [],
      calendarDate,
      partySize: 2,
      openingHour: 13,
      closingHour: 15,
      slotIntervalMinutes: 30,
      now: testNow,
    })
    expect(cap).toBe(24)
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].seatsLeft).toBe(24)
    expect(slots[0].isAvailable).toBe(true)
  })

  it('decreases seatsLeft after one reservation', () => {
    const slotStart = new Date(2026, 5, 15, 13, 0, 0)
    const { slots } = calculateSlotsFromData({
      tables,
      reservations: [
        {
          status: 'CONFIRMED',
          party_size: 2,
          scheduled_at: slotStart.toISOString(),
          duration_minutes: 90,
        },
      ],
      calendarDate,
      partySize: 2,
      openingHour: 13,
      closingHour: 15,
      slotIntervalMinutes: 30,
      now: testNow,
    })
    const onePm = slots.find((s) => new Date(s.startTime).getHours() === 13)
    expect(onePm?.seatsLeft).toBe(22)
    expect(onePm?.isAvailable).toBe(true)
  })

  it('marks slot unavailable when capacity insufficient for party size', () => {
    const slotStart = new Date(2026, 5, 15, 13, 0, 0)
    const { slots } = calculateSlotsFromData({
      tables,
      reservations: [
        {
          status: 'CONFIRMED',
          party_size: 22,
          scheduled_at: slotStart.toISOString(),
          duration_minutes: 90,
        },
      ],
      calendarDate,
      partySize: 2,
      openingHour: 13,
      closingHour: 15,
      slotIntervalMinutes: 30,
      now: testNow,
    })
    const onePm = slots.find((s) => new Date(s.startTime).getHours() === 13)
    expect(onePm?.seatsLeft).toBe(2)
    expect(onePm?.isAvailable).toBe(true)
    const { slots: slotsParty22 } = calculateSlotsFromData({
      tables,
      reservations: [
        {
          status: 'CONFIRMED',
          party_size: 22,
          scheduled_at: slotStart.toISOString(),
          duration_minutes: 90,
        },
      ],
      calendarDate,
      partySize: 22,
      openingHour: 13,
      closingHour: 15,
      slotIntervalMinutes: 30,
      now: testNow,
    })
    const full = slotsParty22.find((s) => new Date(s.startTime).getHours() === 13)
    expect(full?.isAvailable).toBe(false)
  })

  it('does not count cancelled or completed or waitlist status', () => {
    const slotStart = new Date(2026, 5, 15, 13, 0, 0)
    const base = {
      party_size: 10,
      scheduled_at: slotStart.toISOString(),
      duration_minutes: 90,
    }
    for (const status of ['CANCELLED', 'COMPLETED', 'WAITLIST']) {
      const { slots } = calculateSlotsFromData({
        tables,
        reservations: [{ ...base, status }],
        calendarDate,
        partySize: 2,
        openingHour: 13,
        closingHour: 14,
        slotIntervalMinutes: 30,
        now: testNow,
      })
      expect(slots[0].seatsLeft).toBe(24)
    }
  })

  it('counts overlapping reservations only', () => {
    const res1Start = new Date(2026, 5, 15, 13, 0, 0)
    const res2Start = new Date(2026, 5, 15, 15, 0, 0)
    const { slots } = calculateSlotsFromData({
      tables,
      reservations: [
        {
          status: 'CONFIRMED',
          party_size: 4,
          scheduled_at: res1Start.toISOString(),
          duration_minutes: 90,
        },
        {
          status: 'CONFIRMED',
          party_size: 6,
          scheduled_at: res2Start.toISOString(),
          duration_minutes: 90,
        },
      ],
      calendarDate,
      partySize: 2,
      openingHour: 13,
      closingHour: 16,
      slotIntervalMinutes: 30,
      now: testNow,
    })
    const onePm = slots.find((s) => new Date(s.startTime).getHours() === 13)
    const threePm = slots.find((s) => new Date(s.startTime).getHours() === 15)
    expect(onePm?.seatsLeft).toBe(20)
    expect(threePm?.seatsLeft).toBe(18)
  })

  it('never returns negative seats', () => {
    const seatsLeft = computeSeatsLeft([{ party_size: 100 }], 24)
    expect(seatsLeft).toBe(0)
  })

  it('inactive tables do not count', () => {
    const { totalCapacity: cap } = calculateSlotsFromData({
      tables: [{ capacity: 24, is_active: false }],
      reservations: [],
      calendarDate,
      partySize: 2,
      openingHour: 13,
      closingHour: 14,
      now: testNow,
    })
    expect(cap).toBe(0)
  })

  it('findBookableSlot matches time within interval', () => {
    const slots = [
      {
        startTime: new Date(2026, 5, 15, 13, 0).toISOString(),
        endTime: new Date(2026, 5, 15, 13, 30).toISOString(),
        isAvailable: true,
        seatsLeft: 10,
        capacityAvailable: 10,
      },
    ]
    const found = findBookableSlot(slots, new Date(2026, 5, 15, 13, 0), 2)
    expect(found).toBeTruthy()
  })

  it('findBookableSlot matches near slot start when slightly drifted', () => {
    const start = new Date(2026, 5, 15, 13, 0, 0)
    const slots = [
      {
        startTime: start.toISOString(),
        endTime: new Date(2026, 5, 15, 13, 30).toISOString(),
        isAvailable: true,
        seatsLeft: 8,
        capacityAvailable: 8,
      },
    ]
    const picked = new Date(start.getTime() + 30_000)
    expect(findBookableSlot(slots, picked, 2)).toBeTruthy()
  })

  it('interval overlap helper', () => {
    const a0 = new Date('2026-06-15T13:00:00')
    const a1 = new Date('2026-06-15T14:30:00')
    const b0 = new Date('2026-06-15T13:30:00')
    const b1 = new Date('2026-06-15T14:00:00')
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(true)
    expect(
      intervalsOverlap(a0, a1, new Date('2026-06-15T14:30:00'), new Date('2026-06-15T15:00:00'))
    ).toBe(false)
  })

  it('toCalendarDateString accepts YYYY-MM-DD', () => {
    expect(toCalendarDateString('2026-05-27')).toBe('2026-05-27')
  })
})
