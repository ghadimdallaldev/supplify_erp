-- Seed data for Supplify v2

-- Insert admin user
INSERT INTO app_user (keycloak_sub, email, display_name, role) VALUES 
('admin-sub', 'admin@supplify.com', 'Admin User', 'ADMIN')
ON CONFLICT (keycloak_sub) DO NOTHING;

-- Insert sample supplier
INSERT INTO supplier (id, name, slug, vat_no, contact_email, phone, address_json) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'Fresh Foods Co.', 'fresh-foods-co', 'VAT123456789', 'contact@freshfoods.com', '+971501234567', 
 '{"street": "123 Business District", "city": "Dubai", "region": "Dubai", "country": "UAE"}')
ON CONFLICT (slug) DO NOTHING;

-- Insert sample restaurant
INSERT INTO restaurant (id, name, slug, trade_license_no, contact_email, phone, address_json) VALUES 
('550e8400-e29b-41d4-a716-446655440002', 'Golden Fork Restaurant', 'golden-fork-restaurant', 'TL987654321', 'orders@goldenfork.com', '+971507654321',
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

-- Insert sample branch for the restaurant
INSERT INTO branch (id, tenant_id, name, code, address, contact_name, contact_email, contact_phone, is_active)
VALUES (
  '770e8400-e29b-41d4-a716-4466554400aa',
  '550e8400-e29b-41d4-a716-446655440002',
  'Dubai Marina Branch',
  'DXB-MARINA',
  '{"street": "456 Marina Walk", "city": "Dubai", "region": "Dubai", "country": "UAE"}',
  'Sara Malik',
  'sara.malik@goldenfork.com',
  '+971507654322',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Insert sample users
INSERT INTO app_user (keycloak_sub, email, display_name, role) VALUES
('restaurant-sub', 'orders@goldenfork.com', 'Golden Fork Ops', 'RESTAURANT')
ON CONFLICT (keycloak_sub) DO NOTHING;

INSERT INTO app_user (keycloak_sub, email, display_name, role) VALUES
('supplier-sub', 'contact@freshfoods.com', 'Fresh Foods Account', 'SUPPLIER')
ON CONFLICT (keycloak_sub) DO NOTHING;

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