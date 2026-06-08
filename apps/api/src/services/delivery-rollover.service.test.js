import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => {
  const queryMock = vi.fn()
  const clientQuery = vi.fn()
  return {
    query: queryMock,
    withTransaction: vi.fn(async (fn) => fn({ query: clientQuery })),
    pool: { query: queryMock },
  }
})

vi.mock('../config/env.js', () => ({
  config: {
    DELIVERY_ROLLOVER_ENABLED: true,
    DELIVERY_ROLLOVER_CUTOFF_HOUR: 3,
    DELIVERY_ROLLOVER_TIMEZONE: 'Asia/Beirut',
    DELIVERY_ROLLOVER_KEEP_DRIVER: true,
  },
}))

vi.mock('../lib/audit.js', () => ({
  writeSystemAuditLog: vi.fn(),
}))

vi.mock('./notification.service.js', () => ({
  notifyDeliveryRolloverBatch: vi.fn(),
}))

import { query, withTransaction } from '../lib/db.js'
import {
  findUndeliveredAssignmentsForRollover,
  rolloverAssignmentToNextDay,
  runDeliveryRolloverJob,
  ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES,
} from './delivery-rollover.service.js'
import { writeSystemAuditLog } from '../lib/audit.js'

describe('delivery-rollover.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('findUndeliveredAssignmentsForRollover filters by cutoff', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'da-1',
          status: 'out_for_delivery',
          order_status: 'SHIPPED',
          effective_delivery_date: '2026-06-08',
          rolled_over_at: null,
        },
        {
          id: 'da-2',
          status: 'assigned',
          order_status: 'SHIPPED',
          effective_delivery_date: '2026-06-10',
          rolled_over_at: null,
        },
      ],
    })

    const rows = await findUndeliveredAssignmentsForRollover({
      now: new Date('2026-06-09T12:00:00Z'),
      cutoff: 3,
      timeZone: 'Asia/Beirut',
    })

    expect(rows.map((r) => r.id)).toEqual(['da-1'])
  })

  it('skips delivered assignments on rollover', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'da-delivered',
          status: 'delivered',
          order_status: 'SHIPPED',
          effective_delivery_date: '2026-06-08',
          supplier_id: 'sup-1',
          order_id: 'ord-1',
          driver_id: 'drv-1',
          address_json: {},
        },
      ],
    })

    const outcome = await rolloverAssignmentToNextDay({
      assignmentId: 'da-delivered',
      force: true,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('ineligible_status')
  })

  it('skips terminal orders on rollover', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'da-1',
          status: 'assigned',
          order_status: 'RECEIVED_FULL',
          effective_delivery_date: '2026-06-08',
          supplier_id: 'sup-1',
          order_id: 'ord-1',
        },
      ],
    })

    const outcome = await rolloverAssignmentToNextDay({
      assignmentId: 'da-1',
      force: true,
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.reason).toBe('terminal_order')
  })

  it('rolls eligible assignment to rescheduled with next date', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'da-1',
          status: 'picked_up',
          order_status: 'SHIPPED',
          effective_delivery_date: '2026-06-08',
          supplier_id: 'sup-1',
          order_id: 'ord-1',
          driver_id: 'drv-1',
          driver_name: 'Ali',
          vehicle_type: null,
          vehicle_plate: null,
          address_json: {},
          notes: null,
          rolled_over_at: null,
        },
      ],
    })

    const clientQuery = vi.fn()
    withTransaction.mockImplementationOnce(async (fn) => fn({ query: clientQuery }))

    clientQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'da-1',
            status: 'picked_up',
            order_id: 'ord-1',
            supplier_id: 'sup-1',
            driver_id: 'drv-1',
            notes: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'route-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ next_seq: 1 }] })
      .mockResolvedValueOnce({ rows: [] })

    const outcome = await rolloverAssignmentToNextDay({
      assignmentId: 'da-1',
      force: true,
      actorUserId: 'user-1',
    })

    expect(outcome.ok).toBe(true)
    expect(outcome.scheduledDeliveryDate).toBe('2026-06-09')
    const updateCall = clientQuery.mock.calls.find((c) =>
      String(c[0]).includes("status = 'rescheduled'")
    )
    expect(updateCall).toBeTruthy()
    expect(writeSystemAuditLog).toHaveBeenCalled()
  })

  it('runDeliveryRolloverJob is no-op when disabled', async () => {
    const { config } = await import('../config/env.js')
    config.DELIVERY_ROLLOVER_ENABLED = false

    const result = await runDeliveryRolloverJob()
    expect(result.enabled).toBe(false)
    expect(result.rolled).toBe(0)

    config.DELIVERY_ROLLOVER_ENABLED = true
  })

  it('eligible statuses include active delivery states', () => {
    expect(ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES).toContain('out_for_delivery')
    expect(ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES).not.toContain('delivered')
    expect(ROLLOVER_ELIGIBLE_ASSIGNMENT_STATUSES).not.toContain('failed')
  })
})
