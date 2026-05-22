-- ============================================================================
-- 0007_inbox_realtime.sql
--
-- Make the inbox actually update in real time.
--
-- 1. Enable Supabase Realtime publication on `messages` and `leads`. Without
--    this, the browser subscribes to a channel but never receives events —
--    new inbound SMS would only appear after a manual refresh.
--
-- 2. Add an index on the messages.lead_id + created_at so the inbox query
--    that sorts each thread by recency stays fast as the table grows.
--
-- 3. Add a Postgres index on the digit-only suffix of lead phones so the
--    inbound webhook can match leads regardless of how the phone was
--    formatted on save ("(484) 264-1230" vs "484-264-1230" vs "+14842641230"
--    all resolve to the same lead). Uses a functional expression index on
--    right(regexp_replace(phone, '[^0-9]', '', 'g'), 10).
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run.
-- ============================================================================

-- ---------- 1. Enable Realtime on messages + leads ---------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE leads;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  ELSE
    RAISE NOTICE 'supabase_realtime publication not found — Realtime may need to be enabled on the project first';
  END IF;
END
$$;

-- ---------- 2. Inbox thread sort index --------------------------------------
CREATE INDEX IF NOT EXISTS messages_lead_created_idx
  ON messages (lead_id, created_at DESC);

-- ---------- 3. Phone digit-suffix index for inbound matching ----------------
-- An expression index lets the webhook do a fast WHERE
--   right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = $last10
-- without a sequential scan, regardless of how the phone was originally
-- formatted. We don't change the existing storage format — the index just
-- makes the normalized comparison O(log n).
CREATE INDEX IF NOT EXISTS leads_phone_digits_idx
  ON leads ((right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)));

-- ---------- Verify ----------------------------------------------------------
-- After running, this query should list both `leads` and `messages`:
--   SELECT pubname, tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' ORDER BY tablename;
--
-- And this query should return the row your webhook would match for an
-- inbound from +1XXXXXXXXXX (replace the last 10 digits):
--   SELECT id, full_name, phone FROM leads
--   WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = '4842641230';
