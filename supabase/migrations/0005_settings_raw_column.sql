-- Add the `raw` jsonb column to settings.
--
-- Several places in the app write to settings.raw:
--   • saveSettings (page.jsx) — stashes agent_availability as a fallback
--   • cron dispatcher — writes `last_cron_tick` + `last_cron_summary` every run
--   • calendar feed — used to persist the feed token before it was promoted
--     to its own column
--   • health check — reads last_cron_tick to verify the cron is alive
--
-- The settings table was originally created in the Supabase UI without this
-- column, so all of those writes were failing with
-- `column "raw" does not exist`. The most visible symptom for Morgan was
-- the Settings → Save flow erroring out and the toast showing the column
-- name. Other symptoms (silent ones): the cron heartbeat never updating,
-- the calendar-feed-token path no-op'ing, etc.
--
-- Idempotent: safe to re-run.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS raw jsonb DEFAULT '{}'::jsonb;

-- Make sure the singleton row has a non-null raw object so reads like
-- `settings.raw?.last_cron_tick` don't trip over `null`.
UPDATE settings
SET raw = COALESCE(raw, '{}'::jsonb)
WHERE id = 1 AND raw IS NULL;
