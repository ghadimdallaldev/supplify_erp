-- Extended staff app schema for PTO, swaps, announcements, documents, incidents, payroll exports

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_pto_type') THEN
    CREATE TYPE staff_pto_type AS ENUM ('VACATION','SICK','PERSONAL','UNPAID','OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_pto_status') THEN
    CREATE TYPE staff_pto_status AS ENUM ('PENDING','APPROVED','DECLINED','CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staff_pto_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  type staff_pto_type NOT NULL,
  status staff_pto_status NOT NULL DEFAULT 'PENDING',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  hours_requested NUMERIC(6,2),
  reason TEXT,
  manager_note TEXT,
  policy_snapshot JSONB,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_pto_restaurant_status ON staff_pto_request (restaurant_id, status);
CREATE INDEX idx_staff_pto_staff ON staff_pto_request (staff_id);

CREATE TABLE IF NOT EXISTS staff_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  availability JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, weekday)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_swap_status') THEN
    CREATE TYPE staff_swap_status AS ENUM ('REQUESTED','APPROVED','DECLINED','CANCELLED','COMPLETED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staff_shift_swap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES staff_shift(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  proposed_cover_id UUID REFERENCES staff_member(id) ON DELETE SET NULL,
  status staff_swap_status NOT NULL DEFAULT 'REQUESTED',
  reason TEXT,
  manager_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_swap_restaurant_status ON staff_shift_swap (restaurant_id, status);

CREATE TABLE IF NOT EXISTS staff_announcement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience JSONB,
  require_ack BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_announcement_restaurant ON staff_announcement (restaurant_id, published_at DESC);

CREATE TABLE IF NOT EXISTS staff_announcement_ack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES staff_announcement(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, staff_id)
);

CREATE TABLE IF NOT EXISTS staff_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  title TEXT,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('ACTIVE','EXPIRED','RENEWAL_REQUIRED')) DEFAULT 'ACTIVE',
  metadata JSONB,
  uploaded_by UUID REFERENCES app_user(id) ON DELETE SET NULL
);

CREATE INDEX idx_staff_document_restaurant ON staff_document (restaurant_id, status);
CREATE INDEX idx_staff_document_staff ON staff_document (staff_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_incident_severity') THEN
    CREATE TYPE staff_incident_severity AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staff_incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff_member(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  severity staff_incident_severity NOT NULL DEFAULT 'LOW',
  occurred_at TIMESTAMPTZ NOT NULL,
  reported_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  notes TEXT,
  follow_up_action TEXT,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_incident_restaurant ON staff_incident (restaurant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS staff_performance_note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_member(id) ON DELETE CASCADE,
  note_type TEXT CHECK (note_type IN ('COACHING','KUDOS','GENERAL')) NOT NULL DEFAULT 'GENERAL',
  body TEXT NOT NULL,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_performance_restaurant ON staff_performance_note (restaurant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS staff_payroll_export (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT CHECK (status IN ('DRAFT','APPROVED','EXPORTED')) NOT NULL DEFAULT 'DRAFT',
  totals JSONB,
  export_url TEXT,
  exported_at TIMESTAMPTZ,
  exported_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_payroll_restaurant ON staff_payroll_export (restaurant_id, period_end DESC);

COMMENT ON TABLE staff_pto_request IS 'Staff paid time off and leave requests.';
COMMENT ON TABLE staff_shift_swap IS 'Shift swap and coverage requests between staff.';
COMMENT ON TABLE staff_announcement IS 'Front-of-house announcements with read receipts.';
COMMENT ON TABLE staff_document IS 'Staff documents, certifications, and onboarding materials.';
COMMENT ON TABLE staff_incident IS 'Incident reports and follow-up tracking.';
COMMENT ON TABLE staff_performance_note IS 'Performance notes and recognition.';
COMMENT ON TABLE staff_payroll_export IS 'Payroll-ready export summaries for a pay period.';


