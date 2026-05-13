-- Seed data for Supplify v2

-- Single admin user (1 admin, 1 restaurant, 1 supplier for testing; Keycloak: run seed:demo-users)
INSERT INTO app_user (keycloak_sub, email, display_name, role) VALUES 
('admin-sub', 'admin@supplify.com', 'Admin User', 'ADMIN')
ON CONFLICT (email) DO UPDATE SET keycloak_sub = EXCLUDED.keycloak_sub, display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Insert sample supplier (contact_email must match Keycloak user for /auth/me)
INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'Fresh Foods Co.', 'fresh-foods-co', 'VAT123456789', 'supplier@supplify.com', '+971501234567', 
 '{"street": "123 Business District", "city": "Dubai", "region": "Dubai", "country": "UAE"}')
ON CONFLICT (slug) DO NOTHING;

-- Insert sample restaurant (contact_email must match Keycloak user for /auth/me)
INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json) VALUES 
('550e8400-e29b-41d4-a716-446655440002', 'Golden Fork Restaurant', 'golden-fork-restaurant', 'TL987654321', 'restaurant@supplify.com', '+971507654321',
 '{"street": "456 Marina Walk", "city": "Dubai", "region": "Dubai", "country": "UAE"}')
ON CONFLICT (slug) DO NOTHING;

-- Insert sample catalog
INSERT INTO catalog (supplier_id, name, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'Fresh Foods Catalog', true);

-- Insert sample products
INSERT INTO product (supplier_id, sku, name, name_ar, description, description_ar, brand, category, unit) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'FF001', 'Fresh Tomatoes', 'طماطم طازجة', 'Premium fresh tomatoes', 'طماطم طازجة عالية الجودة', 'Fresh Foods', 'Vegetables', 'kg'),
('550e8400-e29b-41d4-a716-446655440001', 'FF002', 'Organic Lettuce', 'خس عضوي', 'Fresh organic lettuce', 'خس عضوي طازج', 'Fresh Foods', 'Vegetables', 'pack'),
('550e8400-e29b-41d4-a716-446655440001', 'FF003', 'Chicken Breast', 'صدر دجاج', 'Fresh chicken breast', 'صدر دجاج طازج', 'Fresh Foods', 'Meat', 'kg'),
('550e8400-e29b-41d4-a716-446655440001', 'FF004', 'Basmati Rice', 'أرز بسمتي', 'Premium basmati rice', 'أرز بسمتي عالي الجودة', 'Fresh Foods', 'Grains', 'kg'),
('550e8400-e29b-41d4-a716-446655440001', 'FF005', 'Olive Oil', 'زيت زيتون', 'Extra virgin olive oil', 'زيت زيتون بكر ممتاز', 'Fresh Foods', 'Oils', 'bottle');

-- Insert sample prices
INSERT INTO price (product_id, currency, amount, min_qty) VALUES 
((SELECT id FROM product WHERE sku = 'FF001'), 'USD', 2.50, 1),
((SELECT id FROM product WHERE sku = 'FF002'), 'USD', 1.80, 1),
((SELECT id FROM product WHERE sku = 'FF003'), 'USD', 8.50, 1),
((SELECT id FROM product WHERE sku = 'FF004'), 'USD', 3.20, 1),
((SELECT id FROM product WHERE sku = 'FF005'), 'USD', 12.00, 1);

-- Insert sample inventory
INSERT INTO inventory (product_id, available_qty) VALUES 
((SELECT id FROM product WHERE sku = 'FF001'), 100.0),
((SELECT id FROM product WHERE sku = 'FF002'), 50.0),
((SELECT id FROM product WHERE sku = 'FF003'), 25.0),
((SELECT id FROM product WHERE sku = 'FF004'), 200.0),
((SELECT id FROM product WHERE sku = 'FF005'), 30.0);

-- Reservation tables for restaurant
INSERT INTO reservation_table (restaurant_id, name, capacity, position, layout, is_active)
VALUES
('550e8400-e29b-41d4-a716-446655440002', 'Table 1', 4, '{"x":1,"y":1}', '{"shape":"round"}', TRUE),
('550e8400-e29b-41d4-a716-446655440002', 'Table 2', 2, '{"x":3,"y":2}', '{"shape":"square"}', TRUE),
('550e8400-e29b-41d4-a716-446655440002', 'Table 3', 6, '{"x":6,"y":1}', '{"shape":"round"}', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Sample reservations
INSERT INTO reservation (
  restaurant_id, status, customer_name, customer_phone, party_size, scheduled_at,
  duration_minutes, tables, notes, waitlist, auto_confirmed
) VALUES
('550e8400-e29b-41d4-a716-446655440002', 'CONFIRMED', 'Amelia Winters', '+971501234567', 4, NOW() + interval '2 hour', 90, ARRAY[(SELECT id FROM reservation_table WHERE name = 'Table 1' LIMIT 1)], 'Birthday cupcake', FALSE, TRUE),
('550e8400-e29b-41d4-a716-446655440002', 'WAITLIST', 'Omar Khalid', '+971509876543', 2, NOW() + interval '3 hour', 90, ARRAY[]::uuid[], 'Prefers terrace seating', TRUE, FALSE),
('550e8400-e29b-41d4-a716-446655440002', 'PENDING', 'Chen Liu', '+971502220000', 6, NOW() + interval '5 hour', 120, ARRAY[(SELECT id FROM reservation_table WHERE name = 'Table 3' LIMIT 1)], NULL, FALSE, FALSE)
ON CONFLICT (id) DO NOTHING;

-- Insert sample branch for the restaurant (restaurant_id for 0015 NOT NULL; tenant_id/address for 0023)
INSERT INTO branch (id, restaurant_id, tenant_id, name, code, address, is_active)
VALUES (
  '770e8400-e29b-41d4-a716-4466554400aa',
  '550e8400-e29b-41d4-a716-446655440002',
  '550e8400-e29b-41d4-a716-446655440002',
  'Dubai Marina Branch',
  'DXB-MARINA',
  '{"street": "456 Marina Walk", "city": "Dubai", "region": "Dubai", "country": "UAE"}',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Insert sample orders to drive the calendar experience
INSERT INTO customer_order (id, restaurant_id, status, total_amount, currency, placed_at, created_at, updated_at, branch_id)
VALUES
('11111111-1111-4111-8111-111111111111', '550e8400-e29b-41d4-a716-446655440002', 'DELIVERED', 120.50, 'USD', '2025-05-01T10:00:00Z', '2025-05-01T09:55:00Z', '2025-05-02T09:00:00Z', '770e8400-e29b-41d4-a716-4466554400aa'),
('22222222-2222-4222-8222-222222222222', '550e8400-e29b-41d4-a716-446655440002', 'PROCESSING', 80.00, 'USD', '2025-05-05T08:00:00Z', '2025-05-05T07:50:00Z', '2025-05-06T10:00:00Z', '770e8400-e29b-41d4-a716-4466554400aa'),
('33333333-3333-4333-8333-333333333333', '550e8400-e29b-41d4-a716-446655440002', 'CANCELLED', 42.75, 'USD', '2025-05-07T06:30:00Z', '2025-05-07T06:20:00Z', '2025-05-07T06:45:00Z', '770e8400-e29b-41d4-a716-4466554400aa')
ON CONFLICT (id) DO NOTHING;

-- Order line items
INSERT INTO order_item (id, order_id, product_id, supplier_id, quantity, unit_price, line_total, notes)
VALUES
('11111111-aaaa-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', (SELECT id FROM product WHERE sku = 'FF001'), '550e8400-e29b-41d4-a716-446655440001', 30.0, 2.50, 75.00, 'Priority delivery'),
('11111111-bbbb-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', (SELECT id FROM product WHERE sku = 'FF005'), '550e8400-e29b-41d4-a716-446655440001', 3.0, 12.00, 36.00, NULL),
('22222222-aaaa-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', (SELECT id FROM product WHERE sku = 'FF003'), '550e8400-e29b-41d4-a716-446655440001', 8.0, 8.50, 68.00, 'Prep for weekend rush'),
('22222222-bbbb-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', (SELECT id FROM product WHERE sku = 'FF002'), '550e8400-e29b-41d4-a716-446655440001', 6.0, 1.80, 10.80, NULL),
('33333333-aaaa-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', (SELECT id FROM product WHERE sku = 'FF004'), '550e8400-e29b-41d4-a716-446655440001', 10.0, 3.20, 32.00, 'Cancelled due to change in menu')
ON CONFLICT (id) DO NOTHING;

-- Sample invoices linked to orders
INSERT INTO invoice (
  id,
  invoice_number,
  supplier_id,
  restaurant_id,
  order_id,
  invoice_date,
  due_date,
  subtotal,
  tax_amount,
  total_amount,
  paid_amount,
  balance_due,
  status,
  currency,
  payment_terms_days,
  created_at,
  updated_at
) VALUES
(
  '99999999-9999-4999-8999-999999999999',
  'INV-2025-0001',
  '550e8400-e29b-41d4-a716-446655440001',
  '550e8400-e29b-41d4-a716-446655440002',
  '11111111-1111-4111-8111-111111111111',
  '2025-05-02',
  '2025-05-15',
  111.00,
  9.50,
  120.50,
  0,
  120.50,
  'ISSUED',
  'USD',
  13,
  '2025-05-02T12:00:00Z',
  '2025-05-02T12:00:00Z'
)
ON CONFLICT (invoice_number) DO NOTHING;

-- Seed sample staff members
INSERT INTO staff_member (
  id,
  restaurant_id,
  status,
  first_name,
  last_name,
  display_name,
  email,
  phone,
  role,
  wage_type,
  wage_rate,
  hire_date,
  profile_color
) VALUES
(
  '910e8400-e29b-41d4-a716-4466554400aa',
  '550e8400-e29b-41d4-a716-446655440002',
  'ACTIVE',
  'Sara',
  'Malik',
  'Sara Malik',
  'sara.malik@goldenfork.com',
  '+971507654322',
  'Floor Manager',
  'SALARY',
  3200.00,
  '2023-01-12',
  '#2563eb'
),
(
  '920e8400-e29b-41d4-a716-4466554400bb',
  '550e8400-e29b-41d4-a716-446655440002',
  'ACTIVE',
  'Imran',
  'Khalid',
  'Imran',
  'imran.khalid@goldenfork.com',
  '+971507654399',
  'Kitchen',
  'HOURLY',
  18.50,
  '2022-10-01',
  '#16a34a'
),
(
  '930e8400-e29b-41d4-a716-4466554400cc',
  '550e8400-e29b-41d4-a716-446655440002',
  'ACTIVE',
  'Layla',
  'Hassan',
  'Layla',
  'layla.hassan@goldenfork.com',
  '+971507650123',
  'Server',
  'HOURLY',
  14.00,
  '2024-03-18',
  '#f97316'
)
ON CONFLICT (id) DO NOTHING;

-- Sample shifts
INSERT INTO staff_shift (
  id,
  restaurant_id,
  staff_id,
  role,
  shift_date,
  starts_at,
  ends_at,
  status,
  notes
) VALUES
(
  '940e8400-e29b-41d4-a716-4466554400dd',
  '550e8400-e29b-41d4-a716-446655440002',
  '930e8400-e29b-41d4-a716-4466554400cc',
  'Server',
  CURRENT_DATE,
  CURRENT_DATE + TIME '10:00',
  CURRENT_DATE + TIME '18:00',
  'PUBLISHED',
  'Lunch + early dinner coverage'
),
(
  '950e8400-e29b-41d4-a716-4466554400ee',
  '550e8400-e29b-41d4-a716-446655440002',
  '920e8400-e29b-41d4-a716-4466554400bb',
  'Kitchen',
  CURRENT_DATE,
  CURRENT_DATE + TIME '09:00',
  CURRENT_DATE + TIME '17:00',
  'PUBLISHED',
  'Prep and line coverage'
)
ON CONFLICT (id) DO NOTHING;

-- Sample open time entry
INSERT INTO staff_time_entry (
  id,
  restaurant_id,
  staff_id,
  shift_id,
  clock_in_at,
  clock_in_method,
  status
) VALUES (
  '960e8400-e29b-41d4-a716-4466554400ff',
  '550e8400-e29b-41d4-a716-446655440002',
  '930e8400-e29b-41d4-a716-4466554400cc',
  '940e8400-e29b-41d4-a716-4466554400dd',
  CURRENT_TIMESTAMP - INTERVAL '2 hours',
  'web',
  'OPEN'
)
ON CONFLICT (id) DO NOTHING;

-- Sample PTO requests
INSERT INTO staff_pto_request (
  id,
  restaurant_id,
  staff_id,
  type,
  status,
  start_date,
  end_date,
  hours_requested,
  reason
) VALUES
(
  '970e8400-e29b-41d4-a716-446655440100',
  '550e8400-e29b-41d4-a716-446655440002',
  '930e8400-e29b-41d4-a716-4466554400cc',
  'VACATION',
  'APPROVED',
  CURRENT_DATE + INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '7 days',
  16,
  'Family weekend getaway'
),
(
  '980e8400-e29b-41d4-a716-446655440111',
  '550e8400-e29b-41d4-a716-446655440002',
  '920e8400-e29b-41d4-a716-4466554400bb',
  'SICK',
  'PENDING',
  CURRENT_DATE + INTERVAL '2 days',
  CURRENT_DATE + INTERVAL '3 days',
  8,
  'Flu symptoms'
)
ON CONFLICT (id) DO NOTHING;

-- Sample shift swap
INSERT INTO staff_shift_swap (
  id,
  restaurant_id,
  shift_id,
  requested_by,
  proposed_cover_id,
  status,
  reason
) VALUES (
  '990e8400-e29b-41d4-a716-446655440122',
  '550e8400-e29b-41d4-a716-446655440002',
  '940e8400-e29b-41d4-a716-4466554400dd',
  '930e8400-e29b-41d4-a716-4466554400cc',
  '910e8400-e29b-41d4-a716-4466554400aa',
  'REQUESTED',
  'Cover needed to attend family event'
)
ON CONFLICT (id) DO NOTHING;

-- Sample availability
INSERT INTO staff_availability (
  id,
  restaurant_id,
  staff_id,
  weekday,
  availability,
  notes
) VALUES (
  '9a0e8400-e29b-41d4-a716-446655440133',
  '550e8400-e29b-41d4-a716-446655440002',
  '930e8400-e29b-41d4-a716-4466554400cc',
  5,
  '{"blocks":[{"start":"10:00","end":"22:00"}]}'::jsonb,
  'Prefers double shifts on Fridays'
)
ON CONFLICT (id) DO NOTHING;

-- Sample announcement
INSERT INTO staff_announcement (
  id,
  restaurant_id,
  title,
  body,
  audience,
  require_ack
) VALUES (
  '9b0e8400-e29b-41d4-a716-446655440144',
  '550e8400-e29b-41d4-a716-446655440002',
  'Menu Refresh Training',
  'Meet at 3pm for the new tasting menu overview. Bring training binder.',
  '{"roles":["Server","Floor Manager"]}'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_announcement_ack (
  id,
  announcement_id,
  staff_id,
  acknowledged_at
) VALUES (
  '9c0e8400-e29b-41d4-a716-446655440155',
  '9b0e8400-e29b-41d4-a716-446655440144',
  '910e8400-e29b-41d4-a716-4466554400aa',
  now()
)
ON CONFLICT (announcement_id, staff_id) DO NOTHING;

-- Sample document
INSERT INTO staff_document (
  id,
  restaurant_id,
  staff_id,
  doc_type,
  title,
  file_url,
  file_size,
  expires_at,
  status
) VALUES (
  '9d0e8400-e29b-41d4-a716-446655440166',
  '550e8400-e29b-41d4-a716-446655440002',
  '920e8400-e29b-41d4-a716-4466554400bb',
  'FOOD_HANDLER_CERT',
  'Food Handler Certificate',
  'https://example.com/docs/food-handler.pdf',
  524288,
  CURRENT_DATE + INTERVAL '11 months',
  'ACTIVE'
)
ON CONFLICT (id) DO NOTHING;

-- Sample incident and performance note
INSERT INTO staff_incident (
  id,
  restaurant_id,
  staff_id,
  category,
  severity,
  occurred_at,
  notes
) VALUES (
  '9e0e8400-e29b-41d4-a716-446655440177',
  '550e8400-e29b-41d4-a716-446655440002',
  '930e8400-e29b-41d4-a716-4466554400cc',
  'Guest complaint',
  'MEDIUM',
  now() - INTERVAL '3 days',
  'Guest reported a delayed appetizer; coaching provided.'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_performance_note (
  id,
  restaurant_id,
  staff_id,
  note_type,
  body
) VALUES (
  '9f0e8400-e29b-41d4-a716-446655440188',
  '550e8400-e29b-41d4-a716-446655440002',
  '910e8400-e29b-41d4-a716-4466554400aa',
  'KUDOS',
  'Handled a large VIP party flawlessly with rave feedback.'
)
ON CONFLICT (id) DO NOTHING;

-- Sample payroll export
INSERT INTO staff_payroll_export (
  id,
  restaurant_id,
  period_start,
  period_end,
  status,
  totals
) VALUES (
  'a00e8400-e29b-41d4-a716-446655440199',
  '550e8400-e29b-41d4-a716-446655440002',
  CURRENT_DATE - INTERVAL '14 days',
  CURRENT_DATE - INTERVAL '1 day',
  'APPROVED',
  '{"regularHours":128,"overtimeHours":12,"breakMinutes":340}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Ensure demo supplier/restaurant contact emails match Keycloak users (for /auth/me)
UPDATE supplier SET contact_email = 'supplier@supplify.com' WHERE slug = 'fresh-foods-co';
UPDATE restaurant SET contact_email = 'restaurant@supplify.com' WHERE slug = 'golden-fork-restaurant';

-- Assign Gold subscription to demo tenants (local dev: unlocks smart_reorder, reports, etc.)
INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
SELECT r.id, 'RESTAURANT', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + interval '1 month'
FROM restaurant r
JOIN (SELECT id, name FROM subscription_plan WHERE code = 'gold' AND tenant_type = 'RESTAURANT' AND is_active = true LIMIT 1) sp ON true
WHERE r.slug = 'golden-fork-restaurant'
AND NOT EXISTS (SELECT 1 FROM subscription s WHERE s.tenant_id = r.id AND s.tenant_type = 'RESTAURANT');

INSERT INTO subscription (tenant_id, tenant_type, plan_id, plan_name, status, billing_cycle, current_period_start, current_period_end)
SELECT s.id, 'SUPPLIER', sp.id, sp.name, 'ACTIVE', 'MONTHLY', now(), now() + interval '1 month'
FROM supplier s
JOIN (SELECT id, name FROM subscription_plan WHERE code = 'gold' AND tenant_type = 'SUPPLIER' AND is_active = true LIMIT 1) sp ON true
WHERE s.slug = 'fresh-foods-co'
AND NOT EXISTS (SELECT 1 FROM subscription sub WHERE sub.tenant_id = s.id AND sub.tenant_type = 'SUPPLIER');