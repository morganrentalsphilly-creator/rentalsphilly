-- ============================================================================
-- 0009_email_signature.sql
--
-- Adds a structured email-signature column to `settings`. The rich signature
-- (name, title, phone, email, website, tagline, license line, fair-housing
-- toggle) is appended to every outbound customer email by sendEmail() —
-- both as a plain-text block on the text/plain part and as a styled card
-- inside the HTML brand shell.
--
-- Why jsonb (and not the existing `emailSignature` text column from 0003):
--   * We need structured fields, not a single blob.
--   * Keeps the existing text column free for legacy single-blob signatures
--     if anything still reads it. (Nothing currently does, but better than
--     a destructive change.)
--
-- Shape stored:
--   {
--     "title":       "Rental Agent · Rentals Philly",
--     "website":     "rentalsphilly.com",
--     "tagline":     "Hand-picked Philly rentals",
--     "licenseLine": "PA RS-XXXXXX",
--     "fairHousing": true
--   }
--
-- Identity fields (name / phone / email) keep using the existing
-- agent_name / agent_phone / agent_email columns — buildSignature()
-- assembles the final block from both sources.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS signature jsonb;

-- ---------- Sanity check ----------------------------------------------------
-- After running, verify with:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='settings' AND column_name='signature';
