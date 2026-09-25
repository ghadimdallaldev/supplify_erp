import { describe, it, expect } from 'vitest'
import {
  buildTimeSlots,
  calculateSlotsFromData,
  computeSeatsLeft,
  intervalsOverlap,
  reservationOverlapsSlot,
  assertSlotBookable,
  findBookableSlot,
  assignTablesForParty,
  holdTablesForParty,
  publicDepositFields,
  getTableAssignmentError,
  toCalendarDateString,
  dateAtHour,
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

  it('seats a party at one table that fits instead of several smaller ones', () => {
    const assigned = assignTablesForParty(
      [
        { id: 'two-a', capacity: 2, is_active: true },
        { id: 'two-b', capacity: 2, is_active: true },
        { id: 'four', capacity: 4, is_active: true },
      ],
      4
    )
    expect(assigned.tableIds).toEqual(['four'])
  })

  it('combines small tables when no single table fits', () => {
    const assigned = assignTablesForParty(
      [
        { id: 'two-a', capacity: 2, is_active: true },
        { id: 'two-b', capacity: 2, is_active: true },
      ],
      4
    )
    expect(assigned.tableIds).toEqual(['two-a', 'two-b'])
    expect(assigned.seats).toBe(4)
  })

  it('rejects a table assignment that cannot seat the party', () => {
    expect(
      getTableAssignmentError({
        partySize: 6,
        tableIds: ['t1'],
        tables: [{ id: 't1', capacity: 2, is_active: true }],
        scheduledAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 90,
        otherReservations: [],
      })
    ).toMatch(/do not seat/)
  })

  it('tells the guest when the party size is not allowed', () => {
    expect(() =>
      assertSlotBookable(
        { partySizeRejected: true, minPartySize: 2, maxPartySize: 8, slots: [] },
        '2026-06-15T18:00:00.000Z',
        12
      )
    ).toThrow(/between 2 and 8/)
  })

  it('rejects a table that is already booked at the same time', () => {
    expect(
      getTableAssignmentError({
        partySize: 2,
        tableIds: ['t1'],
        tables: [{ id: 't1', capacity: 4, is_active: true }],
        scheduledAt: '2026-06-15T18:00:00.000Z',
        durationMinutes: 90,
        otherReservations: [
          {
            status: 'CONFIRMED',
            tables: ['t1'],
            scheduled_at: '2026-06-15T18:30:00.000Z',
            duration_minutes: 90,
          },
        ],
      })
    ).toMatch(/already booked/)
  })
})

describe('holdTablesForParty', () => {
  it('holds a free table that fits the party', async () => {
    const calls = []
    const queryFn = async (sql) => {
      calls.push(sql)
      if (String(sql).includes('unnest')) return { rows: [] }
      return { rows: [{ id: 't1', capacity: 4, is_active: true }] }
    }
    const tableIds = await holdTablesForParty(queryFn, {
      restaurantId: 'rest-1',
      scheduledAt: '2026-09-25T16:00:00.000Z',
      durationMinutes: 90,
      partySize: 2,
    })
    expect(tableIds).toEqual(['t1'])
  })

  it('ignores the booking being moved when that table is otherwise free', async () => {
    const queryFn = async (sql, params) => {
      if (String(sql).includes('unnest')) {
        expect(String(sql)).toContain('id <>')
        expect(params).toContain('res-1')
        return { rows: [] }
      }
      return { rows: [{ id: 't1', capacity: 4, is_active: true }] }
    }
    const tableIds = await holdTablesForParty(queryFn, {
      restaurantId: 'rest-1',
      scheduledAt: '2026-09-25T16:00:00.000Z',
      durationMinutes: 90,
      partySize: 2,
      excludeReservationId: 'res-1',
    })
    expect(tableIds).toEqual(['t1'])
  })

  it('refuses the booking when the fitting table is already held', async () => {
    const queryFn = async (sql) => {
      if (String(sql).includes('unnest')) return { rows: [{ table_id: 't1' }] }
      return { rows: [{ id: 't1', capacity: 4, is_active: true }] }
    }
    await expect(
      holdTablesForParty(queryFn, {
        restaurantId: 'rest-1',
        scheduledAt: '2026-09-25T16:00:00.000Z',
        durationMinutes: 90,
        partySize: 2,
      })
    ).rejects.toThrow(/free tables/)
  })
})

describe('public deposit fields', () => {
  it('asks for acknowledgment only when the amount or percent is above zero', () => {
    expect(
      publicDepositFields({
        depositMode: 'percent',
        depositAmount: 0,
        depositPercent: 0,
        depositPolicyText: 'Card hold at the door',
      }).depositRequired
    ).toBe(false)
    expect(
      publicDepositFields({
        depositMode: 'fixed',
        depositAmount: 25,
        depositPercent: 0,
        depositPolicyText: '',
      })
    ).toMatchObject({ depositRequired: true, depositAmount: 25 })
  })
})

describe('reservation slot timezone', () => {
  it('places a 7:00 p.m. Beirut opening at 16:00 UTC', () => {
    expect(dateAtHour('2026-09-25', 19, 'Asia/Beirut').toISOString()).toBe(
      '2026-09-25T16:00:00.000Z'
    )
  })
})
