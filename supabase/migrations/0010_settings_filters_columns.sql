-- Add the two settings fields that the client writes via saveSettings but
-- that nothing in the prior migrations defines:
--
--   • excluded_brokerages  — list of brokerage / leasing-office names to
--     hide from every lead's curated portal. Added per-listing via Settings
--     → Filters & Portals. Previously: read as settings.excluded_brokerages,
--     written via saveSettings({...settings, excluded_brokerages: list}),
--     but DROPPED on the way to the DB because the saveSettings payload
--     mapping didn't include it. UI showed the list but it never persisted —
--     refresh and it was gone.
--
--   • bright_portal_urls   — array of BrightMLS portal URLs Morgan rotates
--     her clients through. Same silent-drop story.
--
-- Both are jsonb arrays. Defaulting to []::jsonb so reads with optional
-- chaining + Array.isArray() guards don't trip on NULL.
--
-- Companion migration to saveSettings + mergeSettingsRow + sole-prop Terms
-- update (May 2026 hardening sweep).

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS excluded_brokerages jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bright_portal_urls  jsonb DEFAULT '[]'::jsonb;

UPDATE settings
SET
  excluded_brokerages = COALESCE(excluded_brokerages, '[]'::jsonb),
  bright_portal_urls  = COALESCE(bright_portal_urls,  '[]'::jsonb)
WHERE id = 1;

-- Sanity check — surface that the columns now exist.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'settings'
  AND column_name IN ('excluded_brokerages', 'bright_portal_urls');
