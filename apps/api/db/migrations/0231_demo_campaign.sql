-- Public demo campaign data lives in the existing environment's Supplify database.
-- Separate platform-owned tables; no operational tenant/account records are created.
CREATE TABLE IF NOT EXISTS demo_campaign_lead (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('restaurant', 'supplier')),
  whatsapp TEXT NOT NULL,
  phone_normalized TEXT NOT NULL UNIQUE,
  email TEXT,
  locations TEXT,
  restaurant_customers TEXT,
  consent_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','demo_done','not_a_fit')),
  notes TEXT NOT NULL DEFAULT '',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  qr_variant TEXT,
  landing_role TEXT
);
CREATE INDEX IF NOT EXISTS demo_campaign_lead_created_idx ON demo_campaign_lead (created_at DESC);
CREATE INDEX IF NOT EXISTS demo_campaign_lead_status_idx ON demo_campaign_lead (status);

-- Anonymous per-tab funnel events. No IP, user agent, auth cookie or tenant ID is stored.
CREATE TABLE IF NOT EXISTS demo_campaign_event (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT,
  detail TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  qr_variant TEXT
);
CREATE INDEX IF NOT EXISTS demo_campaign_event_name_created_idx ON demo_campaign_event (name, created_at DESC);
CREATE INDEX IF NOT EXISTS demo_campaign_event_variant_idx ON demo_campaign_event (qr_variant);
