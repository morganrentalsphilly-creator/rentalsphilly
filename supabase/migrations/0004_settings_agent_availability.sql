-- Add the agent_availability column to settings if it's missing.
--
-- This column holds the agent's shift calendar — the data Morgan enters under
-- Settings → Availability. Before this migration, the column either didn't
-- exist or was stored ad-hoc inside raw jsonb. Either way, shifts weren't
-- being persisted on save, so every reload reverted to defaults.
--
-- Type: jsonb. Holds { shifts: [], blocked_dates: [], weekly_template: {} }.
-- All idempotent — safe to re-run.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS agent_availability jsonb DEFAULT '{}'::jsonb;

-- One-time backfill: if `raw->'agent_availability'` was being used as a
-- fallback, lift its value into the new column. Skips rows where the
-- column is already non-empty so we don't clobber recent saves.
UPDATE settings
SET agent_availability = COALESCE(raw->'agent_availability', '{}'::jsonb)
WHERE id = 1
  AND (agent_availability IS NULL OR agent_availability = '{}'::jsonb)
  AND raw ? 'agent_availability';
