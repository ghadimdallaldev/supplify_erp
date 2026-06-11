-- Track E: Consumer ordering (menu, fulfillment, guest orders)
-- Uses set_updated_at_timestamp() from prior migrations (0023+).

CREATE TABLE IF NOT EXISTS menu_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_category
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_category_restaurant ON menu_category(restaurant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_menu_category_branch ON menu_category(branch_id) WHERE branch_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS menu_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branch(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES menu_category(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC(12, 2) NOT NULL CHECK (base_price >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE menu_item
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_menu_item_category ON menu_item(category_id, is_available);
CREATE INDEX IF NOT EXISTS idx_menu_item_restaurant ON menu_item(restaurant_id, is_available);

CREATE TABLE IF NOT EXISTS menu_modifier_group (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  min_selections INTEGER NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections INTEGER NOT NULL DEFAULT 1 CHECK (max_selections >= 1),
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_modifier_group_item ON menu_modifier_group(menu_item_id);

CREATE TABLE IF NOT EXISTS menu_modifier_option (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_group_id UUID NOT NULL REFERENCES menu_modifier_group(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_delta NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_modifier_option_group ON menu_modifier_option(modifier_group_id, is_available);

CREATE TABLE IF NOT EXISTS branch_fulfillment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL UNIQUE REFERENCES branch(id) ON DELETE CASCADE,
  delivery_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  takeaway_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  dine_in_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  min_order_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  estimated_prep_minutes INTEGER NOT NULL DEFAULT 30 CHECK (estimated_prep_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE branch_fulfillment_config
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS delivery_zone (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  postcode_prefix TEXT,
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  min_order_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delivery_zone
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_delivery_zone_branch ON delivery_zone(branch_id, is_active);

CREATE TABLE IF NOT EXISTS consumer_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  name TEXT,
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_consumer_member_restaurant ON consumer_member(restaurant_id);

CREATE TABLE IF NOT EXISTS consumer_order (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('DELIVERY', 'TAKEAWAY', 'DINE_IN')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')
  ),
  consumer_member_id UUID REFERENCES consumer_member(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  delivery_address JSONB,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  notes TEXT,
  receipt_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE consumer_order
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branch(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_consumer_order_restaurant ON consumer_order(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consumer_order_branch ON consumer_order(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_consumer_order_receipt ON consumer_order(receipt_token);

CREATE TABLE IF NOT EXISTS consumer_order_line (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES consumer_order(id) ON DELETE CASCADE,
  menu_item_id UUID REFERENCES menu_item(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0),
  modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_order_line_order ON consumer_order_line(order_id);

CREATE TABLE IF NOT EXISTS consumer_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES consumer_order(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_order_status_history_order ON consumer_order_status_history(order_id, created_at);

DROP TRIGGER IF EXISTS trg_menu_category_updated_at ON menu_category;
CREATE TRIGGER trg_menu_category_updated_at
  BEFORE UPDATE ON menu_category
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_menu_item_updated_at ON menu_item;
CREATE TRIGGER trg_menu_item_updated_at
  BEFORE UPDATE ON menu_item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_menu_modifier_group_updated_at ON menu_modifier_group;
CREATE TRIGGER trg_menu_modifier_group_updated_at
  BEFORE UPDATE ON menu_modifier_group
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_menu_modifier_option_updated_at ON menu_modifier_option;
CREATE TRIGGER trg_menu_modifier_option_updated_at
  BEFORE UPDATE ON menu_modifier_option
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_branch_fulfillment_config_updated_at ON branch_fulfillment_config;
CREATE TRIGGER trg_branch_fulfillment_config_updated_at
  BEFORE UPDATE ON branch_fulfillment_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_delivery_zone_updated_at ON delivery_zone;
CREATE TRIGGER trg_delivery_zone_updated_at
  BEFORE UPDATE ON delivery_zone
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_consumer_member_updated_at ON consumer_member;
CREATE TRIGGER trg_consumer_member_updated_at
  BEFORE UPDATE ON consumer_member
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_consumer_order_updated_at ON consumer_order;
CREATE TRIGGER trg_consumer_order_updated_at
  BEFORE UPDATE ON consumer_order
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
