import { query } from '../../lib/db.js'
import { getRestaurantTimezone, zonedDayBounds } from '../../lib/tenant-timezone.js'
import { calendarDay } from '../../lib/reorder-calendar.js'
import { getRestaurantSlotAvailability } from '../../lib/reservation-availability.js'
import { assertLegacyBranchOwnedByRestaurant } from '../../lib/branch-scope.js'

const dateProperties = {
  date: {
    type: 'string',
    format: 'date',
    description: 'Restaurant-local calendar date, default today',
  },
  branchId: { type: 'string', format: 'uuid', description: 'Optional authorized branch UUID' },
}

export function createReadTools({ can }) {
  return {
    get_supplier_overview: {
      definition: {
        name: 'get_supplier_overview',
        description:
          'Supplier order workload and recent sales grouped by currency. Start here for broad supplier questions.',
        parameters: { type: 'object', properties: {} },
      },
      available: async (ctx) => ctx.tenantType === 'SUPPLIER' && can(ctx, 'ORDERS_VIEW'),
      run: async (ctx) => {
        const { rows } = await query(
          `SELECT o.currency,
             COUNT(DISTINCT o.id) FILTER (WHERE o.status::text IN ('PLACED','ACKNOWLEDGED','PROCESSING'))::int AS "awaitingPreparation",
             COUNT(DISTINCT o.id) FILTER (WHERE o.status::text = 'SHIPPED')::int AS "inTransit",
             COUNT(DISTINCT o.id) FILTER (WHERE o.status::text NOT IN ('DRAFT','CANCELLED','PENDING_APPROVAL') AND COALESCE(o.placed_at,o.created_at) >= now() - interval '30 days')::int AS "ordersLast30Days",
             COALESCE(SUM(oi.line_total) FILTER (WHERE o.status::text NOT IN ('DRAFT','CANCELLED','PENDING_APPROVAL') AND COALESCE(o.placed_at,o.created_at) >= now() - interval '30 days'),0) AS "salesLast30Days"
           FROM customer_order o JOIN order_item oi ON oi.order_id = o.id
           WHERE oi.supplier_id = $1 GROUP BY o.currency`,
          [ctx.tenantId]
        )
        return { currencies: rows, periodDays: 30 }
      },
    },
    search_products: {
      definition: {
        name: 'search_products',
        description:
          'Find catalog products by name, SKU, or brand. Restaurant results are limited to followed suppliers; supplier results to its own catalog. Open product details for current checkout pricing and stock.',
        parameters: { type: 'object', properties: { search: { type: 'string', maxLength: 160 } } },
      },
      available: async (ctx) =>
        ['RESTAURANT', 'SUPPLIER'].includes(ctx.tenantType) && can(ctx, 'CATALOG_VIEW'),
      run: async (ctx, args) => {
        const { rows } = await query(
          `SELECT p.id AS "productId", p.name AS "productName", p.sku, p.brand, p.unit,
             s.name AS "supplierName"
           FROM product p JOIN supplier s ON s.id = p.supplier_id
           WHERE (p.name ILIKE '%' || $2 || '%' OR p.sku ILIKE '%' || $2 || '%' OR COALESCE(p.brand,'') ILIKE '%' || $2 || '%')
             AND ($3::text = 'SUPPLIER' AND p.supplier_id = $1 OR $3::text = 'RESTAURANT'
               AND EXISTS (SELECT 1 FROM supplier_follow sf JOIN supplier followed ON followed.id = sf.supplier_id
                 WHERE sf.restaurant_id = $1 AND COALESCE(followed.organization_id,followed.id) = COALESCE(s.organization_id,s.id))
               AND NOT EXISTS (SELECT 1 FROM supplier_blocklist sb JOIN supplier blocked ON blocked.id = sb.supplier_id
                 WHERE sb.restaurant_id = $1 AND COALESCE(blocked.organization_id,blocked.id) = COALESCE(s.organization_id,s.id)))
           ORDER BY p.name, p.id LIMIT 16`,
          [ctx.tenantId, String(args.search || '').trim(), ctx.tenantType]
        )
        return {
          products: rows.slice(0, 15),
          hasMore: rows.length > 15,
          catalogScope: ctx.tenantType === 'RESTAURANT' ? 'followed_suppliers' : 'own_catalog',
        }
      },
    },
    get_reservations: {
      definition: {
        name: 'get_reservations',
        description:
          'Restaurant reservations and covers for a local calendar day, with full status counts and a limited guest list. Does not create or change bookings.',
        parameters: { type: 'object', properties: dateProperties },
      },
      available: async (ctx) => ctx.tenantType === 'RESTAURANT' && can(ctx, 'RESERVATIONS_VIEW'),
      run: async (ctx, args) => {
        await assertLegacyBranchOwnedByRestaurant(args.branchId || null, ctx.tenantId)
        const timeZone = await getRestaurantTimezone(ctx.tenantId)
        const date = args.date || calendarDay(new Date(), timeZone)
        const bounds = zonedDayBounds(date, timeZone)
        const params = [
          ctx.tenantId,
          bounds.start.toISOString(),
          new Date(bounds.end.getTime() + 1).toISOString(),
          args.branchId || null,
        ]
        const [{ rows: summary }, { rows }] = await Promise.all([
          query(
            `SELECT status, COUNT(*)::int AS count, SUM(party_size)::int AS covers FROM reservation
            WHERE restaurant_id = $1 AND scheduled_at >= $2 AND scheduled_at < $3
              AND ($4::uuid IS NULL OR branch_id = $4) GROUP BY status`,
            params
          ),
          query(
            `SELECT id, customer_name AS "guestName", party_size AS "partySize", scheduled_at AS "scheduledAt", status
            FROM reservation WHERE restaurant_id = $1 AND scheduled_at >= $2 AND scheduled_at < $3
              AND ($4::uuid IS NULL OR branch_id = $4) ORDER BY scheduled_at,id LIMIT 16`,
            params
          ),
        ])
        return {
          date,
          timeZone,
          summary,
          reservations: rows.slice(0, 15),
          hasMore: rows.length > 15,
        }
      },
    },
    get_reservation_availability: {
      definition: {
        name: 'get_reservation_availability',
        description:
          'Read current restaurant-wide booking availability for a date and party size. Availability is a point-in-time check, not a booking or capacity guarantee.',
        parameters: {
          type: 'object',
          properties: {
            date: dateProperties.date,
            partySize: { type: 'integer', minimum: 1, maximum: 100 },
          },
          required: ['partySize'],
        },
      },
      available: async (ctx) => ctx.tenantType === 'RESTAURANT' && can(ctx, 'RESERVATIONS_VIEW'),
      run: async (ctx, args) => {
        const timeZone = await getRestaurantTimezone(ctx.tenantId)
        const { rows } = await query('SELECT operating_hours FROM restaurant WHERE id = $1', [
          ctx.tenantId,
        ])
        const result = await getRestaurantSlotAvailability(query, {
          restaurantId: ctx.tenantId,
          dateInput: args.date || calendarDay(new Date(), timeZone),
          partySize: args.partySize,
          operatingHours: rows[0]?.operating_hours,
        })
        const available = (result.slots || []).filter((slot) => slot.isAvailable)
        return {
          ...result,
          slots: available.slice(0, 15),
          hasMore: available.length > 15,
          availableSlotCount: available.length,
          timeZone,
          scope: 'restaurant',
          note: result.tableCount
            ? 'Availability can change; use Reservations to create a booking.'
            : 'Configure reservation tables before accepting bookings.',
        }
      },
    },
  }
}
