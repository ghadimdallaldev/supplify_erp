import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { staffRoutes } from './staff.routes.js'
import { STAFF_PORTAL_APP_ROLE } from '../lib/staff-portal-auth.js'

const restaurantUser = {
  id: 'user-restaurant',
  email: 'manager@restaurant.com',
  role: 'RESTAURANT',
}

const staffPortalUser = {
  id: 'user-staff',
  email: 'waiter@restaurant.com',
  role: STAFF_PORTAL_APP_ROLE,
}

let currentUser = { ...restaurantUser }

vi.mock('../lib/rbac.js', () => ({
  requireAuth: (req, res, next) => {
    req.userData = { ...currentUser }
    next()
  },
  requireRole: () => (req, res, next) => next(),
  resolveTenantContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  getRestaurantIdForRequest: vi.fn().mockResolvedValue('rest-1'),
}))

vi.mock('../lib/staff-portal-auth.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    requireStaffPortalAuth: async (req, res, next) => {
      if (req.userData?.role !== STAFF_PORTAL_APP_ROLE) {
        return res.status(403).json({
          ok: false,
          error: { name: 'STAFF_PORTAL_ACCESS_DENIED', message: 'Not a staff portal user' },
        })
      }
      req.staffPortal = {
        staffId: 'staff-1',
        restaurantId: 'rest-1',
        staffMember: { id: 'staff-1', restaurant_id: 'rest-1' },
      }
      next()
    },
    requirePlatformAppAccess: (req, res, next) => {
      if (req.userData?.role === STAFF_PORTAL_APP_ROLE) {
        return res.status(403).json({
          ok: false,
          error: {
            name: 'STAFF_PORTAL_FORBIDDEN',
            message: 'Staff portal accounts cannot access the restaurant admin app.',
          },
        })
      }
      next()
    },
    getStaffMemberForPortalUser: vi.fn(),
    touchStaffPortalLastLogin: vi.fn(),
  }
})

vi.mock('../lib/tenant.js', () => ({
  getRestaurantIdByEmail: vi.fn().mockResolvedValue('rest-1'),
}))

vi.mock('../services/notification.service.js', () => ({
  notifyStaffPtoRequest: vi.fn(),
  notifyStaffSwapRequest: vi.fn(),
}))

vi.mock('../services/staff-portal-account.service.js', () => ({
  createStaffPortalAccount: vi.fn(),
  sendStaffPortalInviteEmail: vi.fn(),
  disableStaffPortalAccess: vi.fn(),
  resetStaffPortalAccess: vi.fn(),
  getStaffPortalAccessRow: vi.fn(),
  mapPortalAccessInfo: vi.fn((row) =>
    row
      ? {
          staffId: row.id,
          status: row.portal_access_enabled ? 'active' : 'none',
          loginUrl: 'http://localhost:5173/staff/login',
        }
      : null
  ),
}))

vi.mock('../services/staff-portal-self.service.js', () => ({
  fetchStaffPortalDashboard: vi.fn().mockResolvedValue({
    staff: { id: 'staff-1', display_name: 'Alex' },
    upcomingShifts: [],
    ptoRequests: [],
    swapRequests: [],
    announcements: [],
    documents: [],
  }),
  fetchStaffPortalTimeEntries: vi.fn().mockResolvedValue([]),
  staffPortalCheckIn: vi.fn(),
  staffPortalCheckOut: vi.fn(),
  submitStaffPortalPto: vi.fn(),
  submitStaffPortalSwap: vi.fn(),
  acknowledgeStaffAnnouncement: vi.fn(),
  setStaffAvailability: vi.fn(),
  getStaffAvailability: vi.fn().mockResolvedValue([]),
}))

const queryMock = vi.fn()
vi.mock('../lib/db.js', () => ({
  query: (...args) => queryMock(...args),
}))

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

describe('staff portal access control', () => {
  let app

  beforeEach(() => {
    vi.clearAllMocks()
    currentUser = { ...restaurantUser }
    app = express()
    app.use(express.json())
    app.use((req, res, next) => {
      req.requestId = 'test-request'
      next()
    })
    app.use('/api/staff', staffRoutes)
  })

  it('blocks staff portal users from admin staff directory', async () => {
    currentUser = { ...staffPortalUser }
    const res = await request(app).get('/api/staff/members').expect(403)
    expect(res.body.error.name).toBe('STAFF_PORTAL_FORBIDDEN')
  })

  it('allows staff portal users on self dashboard only', async () => {
    currentUser = { ...staffPortalUser }
    const res = await request(app).get('/api/staff/self/dashboard').expect(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.data.staff.display_name).toBe('Alex')
  })

  it('allows restaurant managers on admin staff directory', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] })
    const res = await request(app).get('/api/staff/members').expect(200)
    expect(res.body.ok).toBe(true)
  })

  it('blocks staff portal users from reading another staff member by id', async () => {
    currentUser = { ...staffPortalUser }
    const res = await request(app).get('/api/staff/members/other-staff-id').expect(403)
    expect(res.body.error.name).toBe('STAFF_PORTAL_FORBIDDEN')
  })
})
