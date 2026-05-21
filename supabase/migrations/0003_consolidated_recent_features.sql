-- ============================================================================
-- 0003_consolidated_recent_features.sql
--
-- One migration that catches the database up with every feature shipped
-- since 0001/0002. Safe to re-run (all statements are `IF NOT EXISTS` or
-- use `DO $$ ... $$` guards).
--
-- Run in Supabase → SQL Editor → New query → paste this whole file → Run.
--
-- What it adds:
--   settings:  systemTemplates, quickReplyTemplates, emailSignature, notifications, calendar_feed_token
--   leads:     no new columns (tags / notes / source / snoozed_until / retention_history all live in lead.raw jsonb which already exists)
--   tours:     no new columns
--   messages:  no new columns
--
-- After running, verify:
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='settings'
--     ORDER BY column_name;
-- ============================================================================

-- ---------- SETTINGS: customizable templates + notification prefs + ical token

-- The settings table already uses BOTH camelCase quoted columns
-- (e.g. "welcomeMessages") and snake_case lowercase columns
-- (e.g. agent_availability). We follow the existing camelCase convention
-- for the new jsonb fields so the client's `form.systemTemplates` etc.
-- writes cleanly through Supabase's update.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS "systemTemplates"      jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "quickReplyTemplates"  jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "emailSignature"       text,
  ADD COLUMN IF NOT EXISTS notifications          jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS calendar_feed_token    text;

-- Messages: opened/clicked tracking for outbound emails via Resend webhooks.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS opened_at  timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz;

-- The settings row is a singleton (id=1). If the row hasn't been created yet,
-- create it so saveSettings() can update it without erroring. Safe if it exists.
INSERT INTO settings (id)
  VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- ---------- LEADS: no schema change required ------------------------------
-- All new lead-level fields (tags, notes, source, snoozed_until,
-- retention_history, nudge_history, commission, etc.) are stored under
-- leads.raw (jsonb). That column already exists from earlier migrations.
-- We still add a helpful index for snoozed lead filtering.

CREATE INDEX IF NOT EXISTS leads_raw_snoozed_idx
  ON leads ((raw->>'snoozed_until'))
  WHERE raw ? 'snoozed_until';

-- ---------- ACTIVITIES: ensure indices exist for global feed performance --
CREATE INDEX IF NOT EXISTS activities_created_at_idx
  ON activities (created_at DESC);

CREATE INDEX IF NOT EXISTS activities_lead_id_idx
  ON activities (lead_id, created_at DESC);

-- ---------- TASKS: index for the global Today task pull -------------------
CREATE INDEX IF NOT EXISTS tasks_due_date_status_idx
  ON tasks (due_date, status)
  WHERE status = 'pending';

-- ---------- Realtime publication: make sure new tables are streamed -------
-- The inbox subscribes via Supabase Realtime. Adding `tasks` so the Today
-- view can listen for task changes too if we ever wire that up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE activities;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tours;
      EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END
$$;

-- ---------- Sanity check
SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name = 'settings'
  AND column_name IN (
    'systemTemplates',
    'quickReplyTemplates',
    'emailSignature',
    'notifications',
    'calendar_feed_token'
  )
ORDER BY column_name;
