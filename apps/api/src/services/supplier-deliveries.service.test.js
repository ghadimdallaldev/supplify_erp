import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}))

vi.mock('../lib/delivery-board-schema.js', () => ({
  getDeliveryBoardSqlFragments: vi.fn(async () => ({
    branchJoinSql: '',
    driverAssignmentJoinSql: '',
    zoneJoinSql: '',
    deliveryAreaExpr: `'Area'`,
    destinationLatitudeExpr: 'NULL::numeric',
    destinationLongitudeExpr: 'NULL::numeric',
    destinationLabelExpr: 'r.name',
    scheduledAtExpr: 'o.created_at',
    hasPodExpr: 'FALSE',
    driverNameExpr: 'd.full_name',
  })),
  resetDeliveryBoardSqlCacheForTests: vi.fn(),
}))

vi.mock('./driver-location.service.js', () => ({
  getLatestLocationsForDrivers: vi.fn(async () => new Map()),
  isGpsTrackingEnabled: vi.fn(() => false),
}))

import { query } from '../lib/db.js'
import {
  boardRowDedupeKey,
  mapBoardRow,
  getSupplierDeliveryBoard,
} from './supplier-deliveries.service.js'

describe('supplier-deliveries.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSupplierDeliveryBoard', () => {
    it('returns one row per driver assignment for multi-WH orders', async () => {
      query.mockResolvedValueOnce({
        rows: [
          {
            order_id: 'o-multi',
            order_status: 'SHIPPED',
            restaurant_name: 'Multi WH',
            delivery_area: 'North',
            assignment_id: 'da-leg-1',
            warehouse_assignment_id: 'wh-leg-1',
            delivery_status: 'assigned',
            driver_id: 'drv-1',
            driver_name: 'Driver A',
            has_pod: false,
            scheduled_at: new Date(),
            destination_latitude: null,
            destination_longitude: null,
            destination_label: 'Multi WH',
          },
          {
            order_id: 'o-multi',
            order_status: 'SHIPPED',
            restaurant_name: 'Multi WH',
            delivery_area: 'South',
            assignment_id: 'da-leg-2',
            warehouse_assignment_id: 'wh-leg-2',
            delivery_status: 'out_for_delivery',
            driver_id: 'drv-2',
            driver_name: 'Driver B',
            has_pod: false,
            scheduled_at: new Date(),
            destination_latitude: null,
            destination_longitude: null,
            destination_label: 'Multi WH',
          },
        ],
      })

      const board = await getSupplierDeliveryBoard('supplier-1')
      expect(board.orders).toHaveLength(2)
      expect(board.orders.map((o) => o.assignmentId)).toEqual(['da-leg-1', 'da-leg-2'])
      expect(new Set(board.orders.map((o) => o.orderId))).toEqual(new Set(['o-multi']))
      expect(board.stats.total).toBe(2)
    })
  })

  describe('boardRowDedupeKey', () => {
    it('uses assignment id when present', () => {
      expect(boardRowDedupeKey({ assignmentId: 'da-1', orderId: 'o-1' })).toBe('da-1')
      expect(boardRowDedupeKey({ assignment_id: 'da-2', order_id: 'o-1' })).toBe('da-2')
    })

    it('falls back to order id when no assignment', () => {
      expect(boardRowDedupeKey({ orderId: 'o-1' })).toBe('o-1')
      expect(boardRowDedupeKey({ order_id: 'o-2', assignment_id: null })).toBe('o-2')
    })
  })

  describe('mapBoardRow', () => {
    it('maps assignment and warehouse leg fields for mobile-compatible rows', () => {
      const row = mapBoardRow(
        {
          order_id: 'o-1',
          order_status: 'SHIPPED',
          restaurant_name: 'Cafe One',
          delivery_area: 'North',
          assignment_id: 'da-1',
          warehouse_assignment_id: 'wh-1',
          delivery_status: 'picked_up',
          driver_id: 'drv-1',
          driver_name: 'Sam',
          has_pod: false,
          scheduled_at: '2026-09-14T10:00:00.000Z',
          destination_latitude: null,
          destination_longitude: null,
          destination_label: 'Cafe One',
        },
        new Map()
      )

      expect(row).toMatchObject({
        orderId: 'o-1',
        orderStatus: 'SHIPPED',
        restaurantName: 'Cafe One',
        deliveryArea: 'North',
        deliveryStatus: 'out_for_delivery',
        assignmentId: 'da-1',
        warehouseAssignmentId: 'wh-1',
        driverId: 'drv-1',
        driverName: 'Sam',
        hasPod: false,
      })
    })

    it('maps unassigned orders as pending with null assignment ids', () => {
      const row = mapBoardRow(
        {
          order_id: 'o-2',
          order_status: 'PROCESSING',
          restaurant_name: 'Bistro',
          delivery_area: 'Downtown',
          assignment_id: null,
          warehouse_assignment_id: null,
          delivery_status: 'pending',
          driver_id: null,
          driver_name: null,
          has_pod: false,
          scheduled_at: '2026-09-14T11:00:00.000Z',
          destination_latitude: null,
          destination_longitude: null,
          destination_label: 'Bistro',
        },
        new Map()
      )

      expect(row.deliveryStatus).toBe('pending')
      expect(row.assignmentId).toBeNull()
      expect(row.warehouseAssignmentId).toBeNull()
    })
  })
})
