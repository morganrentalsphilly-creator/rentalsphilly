# Launch-day smoke test checklist

Run through this on production (or a Vercel preview pointing at production
Supabase/Twilio/Resend) before flipping DNS. Estimated time: ~30 minutes.

If anything in **Critical paths** fails, do not launch. Items in **Polish
checks** are nice-to-have but not blocking.

---

## Step 0: apply all DB migrations (do this FIRST)

In Supabase → SQL Editor → New query, paste and run each migration file in
`supabase/migrations/` in numerical order. All migrations are idempotent
(`IF NOT EXISTS` everywhere) so re-running is safe.

- [ ] `0001_sms_refinement.sql` — base SMS columns (delivered_at, twilio_sid, etc.)
- [ ] `0002_properties.sql` — properties table
- [ ] `0003_consolidated_recent_features.sql` — systemTemplates, quickReplyTemplates, emailSignature, notifications, calendar_feed_token, message engagement
- [ ] `0004_settings_agent_availability.sql` — agent_availability shift column
- [ ] `0005_settings_raw_column.sql` — raw jsonb (cron heartbeat lives here)
- [ ] `0006_settings_welcome_messages.sql` — welcomeMessages + catch-all for every settings column the client writes

**Verify columns landed:**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'settings' ORDER BY column_name;
```

You should see at minimum: `agent_availability`, `agent_email`, `agent_name`,
`agent_phone`, `automation`, `calendar_feed_token`, `emailSignature`, `id`,
`notifications`, `quickReplyTemplates`, `raw`, `rentspree_dashboard_url`,
`systemTemplates`, `twilio_number`, `updated_at`, `welcomeMessages`.

If any of these are missing, Settings → Save will silently drop those fields
(the client has a resilient fallback that skips unknown columns, but Morgan's
edits to those fields won't persist). Re-run migration 0006 — it's the
catch-all.

---

## Critical paths

### 1. Intake form (anonymous renter)

Open the landing page on a phone (not just desktop — the form is mobile-first).

- [ ] Landing hero renders, Start CTA tappable
- [ ] Tap Start → intake form appears, step 1/8
- [ ] Fill name → blur → no error
- [ ] Type a bad email like `bob@`, blur → red "Email looks invalid" appears under the field
- [ ] Fix the email, fill phone → Continue button activates, hint above it disappears
- [ ] Tap Continue → step 2 (move-in date)
- [ ] Tap "1 month" chip → **screen auto-advances after ~0.5s** to budget
- [ ] Drag budget → Continue activates
- [ ] Skip Areas using "Skip — I'm open anywhere" button
- [ ] Pick employed + credit → **auto-advances** to tour type
- [ ] Pick in-person → **auto-advances** to source
- [ ] Tap Send to my agent → see confirmation page within ~2 sec
- [ ] **Within ~30 seconds:** the phone receives a welcome SMS starting with "Rentals Philly:"
- [ ] **Within ~30 seconds:** the email receives a welcome email
- [ ] **Within ~30 seconds:** morganrentalsphilly@gmail.com receives the "New lead" notification email
- [ ] Open admin → CRM → Today → the new lead appears in Focus Now

### 2. Admin auth

- [ ] Open `/admin` (or click admin link) in a private/incognito window
- [ ] Login screen renders
- [ ] Enter wrong password → red error "Incorrect email or password"
- [ ] Enter correct credentials → admin loads with skeleton then real data
- [ ] **In a different browser** open `/api/data?resource=all` directly → expect 401 JSON
- [ ] In the dev console run `fetch('/api/send-sms', {method:'POST', body:'{}'})` → expect 401 JSON

### 3. Reply flow (you texting the lead)

In the admin CRM, with the new lead from step 1 open:

- [ ] Lead detail header is compact (one or two lines on a phone), shows stage + bucket chip + Text button
- [ ] Tap Text → modal opens with textarea focused
- [ ] Type a quick reply, hit ⌘+Enter (or tap Send) → SMS arrives on the phone
- [ ] Reply STOP from the phone → Twilio auto-confirms opt-out
- [ ] Refresh the lead detail → "Opted out" pill appears in header, Text button shows tooltip about opt-out
- [ ] Reply START from the phone → reactivates
- [ ] Refresh → "Opted out" pill gone, Text button enabled

### 4. Curated link → tour booking

Still working with the same lead:

- [ ] On Lead detail Overview → Curated link panel → paste any valid URL → click Send
- [ ] Phone receives "Your hand-picked rentals are ready" SMS with `/c/[token]` link
- [ ] Tap the link on the phone → curated page loads with Phase 1
- [ ] Pick a couple of addresses + note → submit
- [ ] Admin Lead detail → Scheduling link panel now appears
- [ ] Click Send → phone receives "Pick your tour times" SMS
- [ ] Tap link → curated page shows Phase 2 (time picks)
- [ ] Pick a time → submit
- [ ] Admin Lead detail → Tours card shows the new tour as "upcoming"
- [ ] **24 hours before the tour** (or fake the date via Settings → time offset): tour reminder SMS fires

### 5. Tour day flow

With at least one tour scheduled for today:

- [ ] Today view → Tours section shows the tour with "Route in Maps" + "Print sheet" links
- [ ] Route in Maps opens Google Maps with the address
- [ ] Print sheet opens `/tours/today/print` with the tour list
- [ ] iCal feed URL (Settings → Integrations) loads as valid iCal text (open in browser)

### 6. Security spot checks

In an incognito window:

- [ ] `GET /api/data?resource=all` → 401
- [ ] `GET /api/data?resource=public` → 200 (intentionally public)
- [ ] `POST /api/send-sms` with empty body → 401
- [ ] `POST /api/ai/lead-summary` with empty body → 401
- [ ] `GET /api/sms/blast` → 401
- [ ] Submit intake form **TWICE in 3 seconds** (using same browser, no waiting between steps) → second submission silently dropped (spam guard)
- [ ] `/api/twilio/inbound` posted without signature → 403

---

## Polish checks

### Mobile (test on actual phone)

- [ ] Landing page hero text doesn't overflow
- [ ] Intake form: each step's "Continue" button reachable with thumb
- [ ] Admin Today view: Focus Now queue rows are tap-targets ≥44px
- [ ] Admin Pipeline: swipe horizontally → columns snap one at a time, chip rail jumps between stages
- [ ] Admin Inbox: tap a thread → full-screen thread; back button returns to list
- [ ] Lead detail drawer: header doesn't wrap to 3+ lines

### Desktop

- [ ] Browser tab title shows `(N) Rentals Philly CRM` when there are unread inbound replies
- [ ] Hit `?` from anywhere admin → keyboard shortcut overlay
- [ ] Hit `g t` → Today view; `g i` → Inbox; etc.
- [ ] On Today view, press `1` → opens first Focus Now lead

### Error states

- [ ] Open a curated link with a bogus token (e.g. `/c/zzzzz`) → "Link not found" page, NOT a blank screen
- [ ] In admin, navigate to `/api/data?resource=garbage` → JSON `{ error: 'Unknown resource' }`
- [ ] Force a session expiry (in browser devtools, clear `sb-*` cookies) → next action bounces to login

### Notifications + automations

- [ ] Settings → Automation: each toggle off → corresponding cron sends `{ skipped: '...' }` next run
- [ ] Master switch off → all crons skip
- [ ] Settings → Notifications: turn off "New lead instant email" → submit a test intake → no email to morganrentalsphilly@gmail.com

---

## Environment variables to verify in Vercel

These must be set on the production environment (and ideally on preview too):

```
NEXT_PUBLIC_SUPABASE_URL          # public, fine in client bundle
NEXT_PUBLIC_SUPABASE_ANON_KEY     # public, fine in client bundle
SUPABASE_SERVICE_ROLE_KEY         # server-only, NEVER prefix with NEXT_PUBLIC_

TWILIO_ACCOUNT_SID                # server-only
TWILIO_AUTH_TOKEN                 # server-only (also used to verify inbound webhook signatures)
TWILIO_MESSAGING_SERVICE_SID      # OR TWILIO_PHONE_NUMBER (one of the two)
TWILIO_PHONE_NUMBER               # used if MESSAGING_SERVICE_SID is not set

RESEND_API_KEY                    # server-only
RESEND_FROM_EMAIL                 # the verified sender (e.g. morgan@rentalsphilly.com)

ANTHROPIC_API_KEY                 # server-only — gates AI features

CRON_SECRET                       # server-only — Vercel cron auth
ENABLE_REAL_SENDING               # MUST be set to "true" in production; absence = simulate mode
NEXT_PUBLIC_APP_URL               # https://rentalsphilly.com (or .vercel.app); used for webhook callbacks
```

**One easy mistake:** if `ENABLE_REAL_SENDING` is unset or anything other than
`true`, every SMS/email logs `[SIMULATED]` and silently doesn't go out. Double-check
this on the production env before the first real submission.

---

## After-launch monitoring (first 24h)

- Watch Vercel logs for `[twilio inbound] signature verification failed` (means something is hitting your webhook URL that isn't Twilio — usually fine, but track frequency)
- Watch the messages table for rows with `delivery_status='failed'` — investigate any that aren't `opted_out` or `invalid_phone`
- Watch Resend dashboard for bounce rate >5% — would indicate spam-detection issues
- Check `automation.welcomeMessages` toggle works as expected (turn off, submit a test intake → no welcome SMS fires)
