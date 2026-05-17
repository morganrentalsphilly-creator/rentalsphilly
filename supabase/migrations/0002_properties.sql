-- ============================================================================
-- 0002_properties.sql
--
-- Creates the `properties` table for manually-curated rental listings.
-- Replaces MOCK_LISTINGS in the app. Morgan maintains a pool here; the
-- intake form's matching logic filters this pool by lead criteria.
--
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS properties (
  id                   text PRIMARY KEY,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- BrightMLS / source identifiers
  mls                  text,                                -- e.g. PAPH2301420
  source               text NOT NULL DEFAULT 'manual',     -- manual | brightmls | pocket

  -- Address + location
  address              text NOT NULL,
  unit                 text,
  neighborhood         text,
  zip                  text,

  -- Specs
  price                integer NOT NULL,                   -- monthly rent in dollars
  beds                 numeric NOT NULL,                   -- supports 0 (studio)
  baths                numeric NOT NULL,                   -- supports half baths (1.5)
  sqft                 integer,

  -- Media (first URL used as primary card image)
  photos               jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of image URLs

  -- Leasing contact
  list_office          text,                                -- brokerage name (used by blocklist filter)
  leasing_office       text,                                -- legacy alias — kept for backward compatibility
  leasing_contact      text,                                -- email
  listing_agent        text,
  listing_agent_phone  text,

  -- Availability
  available_date       date,
  pet_policy           text,
  notes                text,                                -- internal-only notes

  -- Lifecycle
  status               text NOT NULL DEFAULT 'active'      -- active | inactive | leased
);

CREATE INDEX IF NOT EXISTS properties_status_idx ON properties (status);
CREATE INDEX IF NOT EXISTS properties_price_idx ON properties (price);
CREATE INDEX IF NOT EXISTS properties_beds_idx ON properties (beds);
CREATE INDEX IF NOT EXISTS properties_list_office_idx ON properties (list_office);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION properties_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS properties_updated_at ON properties;
CREATE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_set_updated_at();
