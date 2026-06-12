/**
 * Staff portal demo — portal-enabled staff, shifts, announcements, availability.
 *
 * Run:  node apps/api/scripts/seed-staff-portal-demo.mjs
 *       node apps/api/scripts/seed-staff-portal-demo.mjs --force
 *       STAFF_DEMO_SLUG=tier-restaurant-gold-01 node apps/api/scripts/seed-staff-portal-demo.mjs
 */
import { query, withTransaction } from '../src/lib/db.js'

const SLUG = process.env.STAFF_DEMO_SLUG || 'tier-restaurant-gold-01'
const FORCE = process.argv.includes('--force')
const DEMO_EMAIL = process.env.STAFF_DEMO_EMAIL || 'demo.server@goldplate.demo'

const DEMO_STAFF_ID = 'a1000000-0000-4000-8000-000000000001'
const DEMO_TEAMMATE_ID = 'a1000000-0000-4000-8000-000000000002'
const SHIFT_IDS = [
  'a2000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000002',
  'a2000000-0000-4000-8000-000000000003',
]
const ANNOUNCEMENT_IDS = [
  'a3000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000002',
]

function shiftWindow(dayOffset, startHour, endHour) {
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  base.setDate(base.getDate() + dayOffset)
  const shiftDate = base.toISOString().slice(0, 10)
  const starts = new Date(base)
  starts.setHours(startHour, 0, 0, 0)
  const ends = new Date(base)
  ends.setHours(endHour, 0, 0, 0)
  return { shiftDate, startsAt: starts.toISOString(), endsAt: ends.toISOString() }
}

async function upsertStaffMember(client, restaurantId, row) {
  await client.query(
    `INSERT INTO staff_member (
       id, restaurant_id, status, first_name, last_name, display_name,
       email, phone, role, wage_type, wage_rate, hire_date, profile_color,
       portal_access_enabled
     )
     VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, 'HOURLY', $9, $10, $11, true)
     ON CONFLICT (id) DO UPDATE SET
       status = 'ACTIVE',
       display_name = EXCLUDED.display_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       role = EXCLUDED.role,
       portal_access_enabled = true,
       updated_at = now()`,
    [
      row.id,
      restaurantId,
      row.firstName,
      row.lastName,
      row.displayName,
      row.email,
      row.phone,
      row.role,
      row.wageRate,
      row.hireDate,
      row.profileColor,
    ]
  )
}

export async function seedStaffPortalDemo() {
  const { rows: restaurants } = await query(
    `SELECT id, slug, name FROM restaurant WHERE slug = $1`,
    [SLUG]
  )
  if (!restaurants.length) {
    throw new Error(
      `Restaurant slug "${SLUG}" not found — set STAFF_DEMO_SLUG or create the restaurant first`
    )
  }
  const restaurant = restaurants[0]

  const { rows: existing } = await query(
    `SELECT id FROM staff_member WHERE id = $1`,
    [DEMO_STAFF_ID]
  )
  if (existing.length && !FORCE) {
    console.log(`Staff portal demo already seeded for ${SLUG}. Use --force to refresh shifts/announcements.`)
  }

  const shifts = [
    { id: SHIFT_IDS[0], ...shiftWindow(0, 17, 23), role: 'Server' },
    { id: SHIFT_IDS[1], ...shiftWindow(2, 11, 19), role: 'Server' },
    { id: SHIFT_IDS[2], ...shiftWindow(5, 18, 23), role: 'Server' },
  ]

  await withTransaction(async (client) => {
    await upsertStaffMember(client, restaurant.id, {
      id: DEMO_STAFF_ID,
      firstName: 'Alex',
      lastName: 'Rivera',
      displayName: 'Alex Rivera',
      email: DEMO_EMAIL,
      phone: '+971500000201',
      role: 'Server',
      wageRate: 16.5,
      hireDate: '2024-06-01',
      profileColor: '#7c3aed',
    })

    await upsertStaffMember(client, restaurant.id, {
      id: DEMO_TEAMMATE_ID,
      firstName: 'Sam',
      lastName: 'Ortiz',
      displayName: 'Sam Ortiz',
      email: 'demo.runner@goldplate.demo',
      phone: '+971500000202',
      role: 'Runner',
      wageRate: 14.0,
      hireDate: '2024-09-15',
      profileColor: '#059669',
    })

    if (FORCE) {
      await client.query(`DELETE FROM staff_shift WHERE id = ANY($1::uuid[])`, [SHIFT_IDS])
      await client.query(`DELETE FROM staff_announcement WHERE id = ANY($1::uuid[])`, [
        ANNOUNCEMENT_IDS,
      ])
    }

    for (const shift of shifts) {
      await client.query(
        `INSERT INTO staff_shift (
           id, restaurant_id, staff_id, role, shift_date, starts_at, ends_at, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'PUBLISHED')
         ON CONFLICT (id) DO UPDATE SET
           shift_date = EXCLUDED.shift_date,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           status = 'PUBLISHED',
           updated_at = now()`,
        [
          shift.id,
          restaurant.id,
          DEMO_STAFF_ID,
          shift.role,
          shift.shiftDate,
          shift.startsAt,
          shift.endsAt,
        ]
      )
    }

    await client.query(
      `INSERT INTO staff_announcement (
         id, restaurant_id, title, body, require_ack, published_at
       )
       VALUES ($1, $2, $3, $4, true, now() - interval '2 hours')
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         require_ack = EXCLUDED.require_ack,
         updated_at = now()`,
      [
        ANNOUNCEMENT_IDS[0],
        restaurant.id,
        'New uniform policy',
        'Black non-slip shoes are required for all floor shifts starting Monday. Pick up your size card from the office.',
      ]
    )

    await client.query(
      `INSERT INTO staff_announcement (
         id, restaurant_id, title, body, require_ack, published_at
       )
       VALUES ($1, $2, $3, $4, false, now() - interval '1 day')
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         body = EXCLUDED.body,
         updated_at = now()`,
      [
        ANNOUNCEMENT_IDS[1],
        restaurant.id,
        'Team meal tonight',
        'Family meal is at 4:30 PM in the back dining room before the dinner rush.',
      ]
    )

    for (const weekday of [1, 3, 5]) {
      await client.query(
        `INSERT INTO staff_availability (restaurant_id, staff_id, weekday, availability, notes)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (staff_id, weekday) DO UPDATE SET
           availability = EXCLUDED.availability,
           notes = EXCLUDED.notes,
           updated_at = now()`,
        [
          restaurant.id,
          DEMO_STAFF_ID,
          weekday,
          JSON.stringify({ blocks: [{ start: '17:00', end: '23:00' }] }),
          'Evening availability',
        ]
      )
    }

    await client.query(
      `INSERT INTO staff_document (
         id, restaurant_id, staff_id, doc_type, title, file_url, status
       )
       VALUES ($1, $2, $3, 'POLICY', 'Employee handbook', $4, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [
        'a4000000-0000-4000-8000-000000000001',
        restaurant.id,
        DEMO_STAFF_ID,
        'https://example.com/staff/handbook.pdf',
      ]
    ).catch(() => {
      /* staff_document may use gen_random_uuid only — skip if no id column conflict */
    })
  })

  const baseUrl = process.env.WEB_ORIGIN || 'http://localhost:5173'
  const summary = {
    restaurant: restaurant.name,
    slug: SLUG,
    demoStaff: {
      name: 'Alex Rivera',
      email: DEMO_EMAIL,
      portalAccess: true,
    },
    seeded: {
      upcomingShifts: shifts.length,
      announcements: 2,
      availabilityDays: 3,
      teammate: 'Sam Ortiz (for swap requests)',
    },
    howToSignIn: [
      `Open ${baseUrl}/staff/login`,
      `Enter work email: ${DEMO_EMAIL}`,
      'Click "Send magic link"',
      'In development (no SMTP), the API returns sessionToken and the app opens the dashboard',
    ],
    urls: {
      login: `${baseUrl}/staff/login`,
      dashboard: `${baseUrl}/staff/dashboard`,
    },
  }

  console.log('\n✅ Staff portal demo seeded:\n', JSON.stringify(summary, null, 2))
  return summary
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-staff-portal-demo.mjs')
if (isMain) {
  try {
    await seedStaffPortalDemo()
    process.exit(0)
  } catch (err) {
    console.error(err.message || err)
    process.exit(1)
  }
}
