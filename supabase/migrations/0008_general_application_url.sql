-- ============================================================================
-- 0008_general_application_url.sql
--
-- Adds the general rental application URL field to settings. This is the
-- shareable RentSpree (or any other) application link Morgan sends to leads
-- with limited credit profiles:
--   * BCMS leads: included in the welcome SMS+email, prompts the application
--     before we start scheduling tours.
--   * BC75+ leads: queued for the 75-day-before-move-in outreach.
--
-- IMPORTANT: this URL is referenced in customer-facing copy. The bucket
-- (which uses credit data internally) drives WHO gets the link, but the link
-- itself is just a generic application URL — no credit language in the copy.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS rentspree_application_url text;

-- ---------- Sanity check ----------------------------------------------------
-- After running, verify with:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='settings' AND column_name='rentspree_application_url';
