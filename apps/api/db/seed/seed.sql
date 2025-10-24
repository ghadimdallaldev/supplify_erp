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
