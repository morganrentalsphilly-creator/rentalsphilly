-- Add every settings column the client writes that isn't backed by an
-- earlier in-repo migration. This is a belt-and-suspenders catch-all —
-- ALL of these statements use `ADD COLUMN IF NOT EXISTS` so it's safe
-- to run even if some columns already exist (from the original Supabase
-- UI setup or earlier migrations).
--
-- The trigger for this migration was the error:
--   "Could not find the 'welcomeMessages' column of 'settings' in the schema cache"
--
-- ...which fires when Morgan tries to save settings. Other columns in
-- this list could fail the same way if Supabase ever forgets them (e.g.
-- the original table was created with some but not all of these).
--
-- Companion to:
--   • 0003_consolidated_recent_features.sql  — systemTemplates, quickReplyTemplates,
--                                              emailSignature, notifications, calendar_feed_token
--   • 0004_settings_agent_availability.sql   — agent_availability
--   • 0005_settings_raw_column.sql           — raw

-- ---- camelCase JSON columns (quoted identifiers, jsonb) ----
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "welcomeMessages"      jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "systemTemplates"      jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "quickReplyTemplates"  jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "emailSignature"       text;

-- ---- snake_case columns ----
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS agent_name              text,
  ADD COLUMN IF NOT EXISTS agent_email             text,
  ADD COLUMN IF NOT EXISTS agent_phone             text,
  ADD COLUMN IF NOT EXISTS twilio_number           text,
  ADD COLUMN IF NOT EXISTS rentspree_dashboard_url text,
  ADD COLUMN IF NOT EXISTS automation              jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_availability      jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notifications           jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calendar_feed_token     text,
  ADD COLUMN IF NOT EXISTS raw                     jsonb   DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at              timestamptz DEFAULT now();

-- Make sure the singleton row has non-null jsonb values so reads with
-- optional chaining don't trip over NULL.
UPDATE settings
SET
  "welcomeMessages"      = COALESCE("welcomeMessages",      '{}'::jsonb),
  "systemTemplates"      = COALESCE("systemTemplates",      '{}'::jsonb),
  "quickReplyTemplates"  = COALESCE("quickReplyTemplates",  '[]'::jsonb),
  automation             = COALESCE(automation,             '{}'::jsonb),
  agent_availability     = COALESCE(agent_availability,     '{}'::jsonb),
  notifications          = COALESCE(notifications,          '{}'::jsonb),
  raw                    = COALESCE(raw,                    '{}'::jsonb)
WHERE id = 1;

-- Sanity check: surface which settings columns now exist so you can verify
-- the migration ran. Comparing against the SELECT below the migration in
-- the SQL editor pane confirms everything's wired up.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'settings'
ORDER BY column_name;
