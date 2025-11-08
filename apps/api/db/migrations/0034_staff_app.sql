-- Staff app foundational schema for single-location restaurants

CREATE TABLE staff_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')) DEFAULT 'ACTIVE',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL,
  wage_type TEXT CHECK (wage_type IN ('HOURLY','SALARY','CONTRACT','OTHER')) DEFAULT 'HOURLY',
  wage_rate NUMERIC(12,2),
  hire_date DATE,
  profile_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, email)
);

CREATE INDEX idx_staff_member_restaurant_status ON staff_member (restaurant_id, status);

CREATE TABLE staff_shift (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_member(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  shift_date DATE NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','COMPLETED','CANCELLED')) DEFAULT 'PUBLISHED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_shift_restaurant_date ON staff_shift (restaurant_id, shift_date);
CREATE INDEX idx_staff_shift_staff_date ON staff_shift (staff_id, shift_date);

CREATE TABLE staff_time_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES staff_shift(id) ON DELETE SET NULL,
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_in_method TEXT,
  clock_out_at TIMESTAMPTZ,
  clock_out_method TEXT,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  break_details JSONB,
  status TEXT NOT NULL CHECK (status IN ('OPEN','APPROVED','LOCKED','ADJUSTMENT_REQUIRED')) DEFAULT 'OPEN',
  note TEXT,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_time_entry_restaurant_staff ON staff_time_entry (restaurant_id, staff_id);
CREATE INDEX idx_staff_time_entry_open ON staff_time_entry (restaurant_id, staff_id) WHERE clock_out_at IS NULL;

COMMENT ON TABLE staff_member IS 'Front-of-house and back-of-house team members for a restaurant.';
COMMENT ON TABLE staff_shift IS 'Scheduled shifts for staff members.';
COMMENT ON TABLE staff_time_entry IS 'Time and attendance entries captured from clock-in/out events.';


