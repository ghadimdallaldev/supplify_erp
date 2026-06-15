-- Migration: 0169_supplier_growth_program.sql
-- Supplier customer import, referral program, sponsored onboarding, platform billing credits

-- Platform-wide 30-day free trial default
INSERT INTO platform_setting (key, value, updated_at)
VALUES ('free_sandbox_days', '30'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

INSERT INTO platform_setting (key, value, updated_at)
VALUES (
  'referral_program_config',
  '{
    "firstPaidDiscountPercent": 20,
    "supplierRewardType": "free_month",
    "referralValidityDays": 90,
    "sponsorshipLimitsPerYear": {"silver": 2, "gold": 10, "platinum": 25, "enterprise": null},
    "eligibleSponsorPlans": ["silver", "gold", "platinum"],
    "connectionRequestExpiryDays": 30
  }'::jsonb,
  now()
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO permission (code, name, domain, description) VALUES
  ('CUSTOMERS_IMPORT', 'Import customers', 'GROWTH', 'Import supplier customer lists via CSV/Excel'),
  ('CUSTOMERS_MANAGE', 'Manage customer growth', 'GROWTH', 'Invite, sponsor, and connect imported customers'),
  ('GROWTH_VIEW', 'View growth metrics', 'GROWTH', 'View supplier customer growth dashboard metrics')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS supplier_customer_import_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_customer_prospect (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  import_batch_id UUID REFERENCES supplier_customer_import_batch(id) ON DELETE SET NULL,
  restaurant_name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  normalized_email TEXT GENERATED ALWAYS AS (NULLIF(lower(trim(email)), '')) STORED,
  address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  area_region TEXT,
  credit_limit NUMERIC(14, 2),
  payment_terms TEXT,
  sales_rep TEXT,
  notes TEXT,
  match_status TEXT NOT NULL DEFAULT 'import_only'
    CHECK (match_status IN ('unmatched', 'existing_supplify', 'import_only')),
  matched_restaurant_id UUID REFERENCES restaurant(id) ON DELETE SET NULL,
  match_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_status TEXT NOT NULL DEFAULT 'imported'
    CHECK (lifecycle_status IN (
      'imported', 'connection_pending', 'connected', 'invited', 'registered', 'sponsored', 'converted', 'expired'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_prospect_email
  ON supplier_customer_prospect (supplier_id, normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_prospect_supplier ON supplier_customer_prospect (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_prospect_lifecycle ON supplier_customer_prospect (supplier_id, lifecycle_status);

CREATE TABLE IF NOT EXISTS supplier_connection_request (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurant(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES supplier_customer_prospect(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_request_pending
  ON supplier_connection_request (supplier_id, restaurant_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_connection_request_restaurant ON supplier_connection_request (restaurant_id, status);

CREATE TABLE IF NOT EXISTS supplier_growth_invitation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL REFERENCES supplier_customer_prospect(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp', 'link')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_referral_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES supplier_customer_prospect(id) ON DELETE SET NULL,
  invitation_id UUID REFERENCES supplier_growth_invitation(id) ON DELETE SET NULL,
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE,
  attribution_type TEXT NOT NULL CHECK (attribution_type IN ('invite', 'sponsor')),
  referral_expires_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  first_paid_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 20,
  first_paid_discount_used BOOLEAN NOT NULL DEFAULT false,
  converted_at TIMESTAMPTZ,
  supplier_reward_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (supplier_reward_status IN ('pending', 'granted', 'ineligible')),
  supplier_reward_type TEXT,
  supplier_reward_value NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_attribution_restaurant ON supplier_referral_attribution (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_referral_attribution_supplier ON supplier_referral_attribution (supplier_id);

CREATE TABLE IF NOT EXISTS supplier_sponsorship (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES supplier_customer_prospect(id) ON DELETE SET NULL,
  restaurant_id UUID REFERENCES restaurant(id) ON DELETE CASCADE,
  attribution_id UUID REFERENCES supplier_referral_attribution(id) ON DELETE SET NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  supplier_billing_invoice_id UUID,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_sponsorship_supplier ON supplier_sponsorship (supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_billing_credit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  tenant_type TEXT NOT NULL CHECK (tenant_type IN ('RESTAURANT', 'SUPPLIER')),
  amount NUMERIC(14, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  remaining_amount NUMERIC(14, 2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'referral_reward',
  source_attribution_id UUID REFERENCES supplier_referral_attribution(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_billing_credit_tenant ON platform_billing_credit (tenant_id, tenant_type);

-- Supplier Owner gets growth permissions via ALL sync; Manager gets view + import
INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, perm.code
FROM tenant_roles tr
CROSS JOIN (VALUES ('GROWTH_VIEW'), ('CUSTOMERS_IMPORT'), ('CUSTOMERS_MANAGE')) AS perm(code)
WHERE tr.tenant_type = 'SUPPLIER' AND tr.is_system = true AND tr.name = 'Owner'
ON CONFLICT (role_id, permission) DO NOTHING;

INSERT INTO tenant_role_permissions (role_id, permission)
SELECT tr.id, perm.code
FROM tenant_roles tr
CROSS JOIN (VALUES ('GROWTH_VIEW'), ('CUSTOMERS_IMPORT')) AS perm(code)
WHERE tr.tenant_type = 'SUPPLIER' AND tr.is_system = true AND tr.name = 'Supplier Manager'
ON CONFLICT (role_id, permission) DO NOTHING;
