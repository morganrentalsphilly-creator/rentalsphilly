-- ============================================================================
-- 0001_sms_refinement.sql
--
-- Adds the columns and tables required for the refined SMS system:
--   - opt-out / consent tracking on leads
--   - reminder-sent flags on tours
--   - Twilio metadata + idempotency on messages
--   - sms_blasts + sms_blast_recipients for bulk SMS queueing
--   - Supabase Realtime publication on messages (for the live inbox)
--
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New Query)
-- or via `supabase db push` if you're using the Supabase CLI.
--
-- All statements are idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`)
-- so it's safe to re-run.
-- ============================================================================

-- ---------- leads: opt-out and consent ---------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS opted_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_source text,
  ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_opted_out_idx ON leads (opted_out);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);

-- ---------- tours: per-reminder idempotency flags ----------------------------
ALTER TABLE tours
  ADD COLUMN IF NOT EXISTS reminders_sent jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------- messages: Twilio metadata + idempotency + kind -------------------
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS twilio_sid text,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Unique on idempotency_key so retries / double-clicks can't double-send
CREATE UNIQUE INDEX IF NOT EXISTS messages_idempotency_key_uidx
  ON messages (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Lookup for the status callback
CREATE INDEX IF NOT EXISTS messages_twilio_sid_idx
  ON messages (twilio_sid) WHERE twilio_sid IS NOT NULL;

-- Lookup for inbound webhook (find lead by phone fast)
CREATE INDEX IF NOT EXISTS messages_lead_created_idx
  ON messages (lead_id, created_at);

-- ---------- sms_blasts: a queued bulk send -----------------------------------
CREATE TABLE IF NOT EXISTS sms_blasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text,                                -- admin user id / email
  body_template   text NOT NULL,                       -- {firstName} etc. allowed
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,  -- saved for audit
  total_count     integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  opted_out_count integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'queued',      -- queued|sending|done|cancelled
  started_at      timestamptz,
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS sms_blasts_status_idx ON sms_blasts (status);

-- ---------- sms_blast_recipients: one row per (blast, lead) -----------------
CREATE TABLE IF NOT EXISTS sms_blast_recipients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id      uuid NOT NULL REFERENCES sms_blasts(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL,
  status        text NOT NULL DEFAULT 'pending',  -- pending|sent|failed|opted_out|skipped
  message_id    uuid,                              -- FK to messages.id once sent
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  UNIQUE (blast_id, lead_id)
);

CREATE INDEX IF NOT EXISTS sms_blast_recipients_pending_idx
  ON sms_blast_recipients (blast_id, status)
  WHERE status = 'pending';

-- ---------- Realtime: publish messages so the inbox updates live ------------
-- Safe to run repeatedly; if the publication doesn't exist (older Supabase
-- projects), it's a no-op error you can ignore. Newer projects always have
-- supabase_realtime.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION WHEN duplicate_object THEN
      -- already added, fine
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE leads;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;

-- ---------- Sanity check ----------------------------------------------------
-- After running, verify with:
--   SELECT column_name FROM information_schema.columns WHERE table_name='leads' AND column_name LIKE 'opt%';
--   SELECT column_name FROM information_schema.columns WHERE table_name='messages' AND column_name IN ('twilio_sid','idempotency_key','kind');
--   SELECT to_regclass('public.sms_blasts'), to_regclass('public.sms_blast_recipients');
