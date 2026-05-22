# Rentals Philly — Launch Readiness

Quick reference for what's been hardened and what to verify before going live.

## Hardened against double-tap / race conditions

Every user-action handler that fires a network call now has a sync `useRef` lock that flips synchronously on entry (so a second tap before React re-renders to disabled exits immediately) and releases in `finally`.

**Admin-side (Morgan):**
- Inbox composer Send + Cmd+Enter
- Lead detail ComposeModal Send + Cmd+Enter
- AddLeadModal Create
- CloseStageModal Confirm (lost / leased)
- ApplicationLinkPanel Send link
- SchedulingLinkPanel Send scheduling link
- CuratedLinkPanel Send curated link
- SubmitApplicationModal Send via Resend + Log only
- ScreeningPasteModal Save & notify client

**Customer-facing:**
- IntakeForm "Send to my agent"
- BookingView "Confirm tour" + "Join waitlist"
- VirtualTourRequest "Request videos"
- `/c/[token]` Phase 1 submit
- `/c/[token]` Phase 2 submit
- `/c/[token]` Reschedule submit

## Server-side idempotency

For the cases where the client lock can't catch retries (network retry, browser back-button replay, refresh-and-resubmit):

- `/api/curated/[token]` Phase 1 — checks `curated_submitted_at` before re-firing confirmation SMS
- `/api/curated/[token]` Phase 2 — checks `times_submitted_at` before creating tour rows
- `/api/data` `create_lead` — phone-based 60-second dedup window
- `/api/intake/welcome` — checks for existing `kind='welcome'` messages
- Every `sendSms` / `sendEmail` call uses `idempotencyKey` enforced by a UNIQUE index on `messages.idempotency_key`

## Bug fixes worth knowing

- **Commission read path**: previously `lead.commission` was read but written to `lead.raw.commission` — all seven readers (CSV export, Pipeline card, weekly KPI, totalCommission tile, AnalyticsView ×2) now migrated
- **`addLead` dedup id**: server-returned deduped lead id is now used downstream — without this, the welcome flow could fire for a `leadId` that doesn't exist
- **`lastNonInternalMessage` / `pickNextTour`**: replaced six array-tail picks (`arr[arr.length-1]` / `.find()`) with max-timestamp picks so optimistic UI and realtime out-of-order inserts don't cause Pipeline preview / Today queue / Inbox badge / ComposeModal "reply owed" to point at the wrong message
- **Inbox draft preservation**: thread-switch-mid-send now reads `activeLeadIdRef.current` (live) so it doesn't wipe the new thread's draft
- **Customer alert sweep**: every `window.alert()` on consumer-facing pages replaced with inline auto-fading notice (4 in ListingsView + 6 in `/c/[token]`)

## Compliance preserved

- A2P 10DLC opt-in disclosure language ("recurring automated text messages... sent via an automatic dialing system", "Consent is not a condition of any purchase", "Msg & data rates may apply", "Reply HELP for help, STOP to cancel")
- Privacy policy: "No mobile information will be shared with third parties or affiliates for marketing or promotional purposes"
- Twilio signature verification on inbound webhook (TWILIO_AUTH_TOKEN)
- `ENABLE_REAL_SENDING` env var gates simulation vs real send
- No BrightMLS / Skale Real Estate brand mentions in customer-facing copy
- No hard time promises ("from submission to tour in 2 days")

## Pre-launch verification

Spot-check these once with real env vars set:

1. **Intake flow** — submit the form, watch your phone + email for welcome SMS + welcome email
2. **STOP reply** — reply STOP from a test phone, verify opted_out flag flips, verify you can't send to that lead anymore
3. **Curated link** — send yourself a curated link, click through, verify Phase 1 → Phase 2 transitions cleanly
4. **Tour booking** — pick a time, confirm, check that the tour shows up in your CRM Tours tab AND in your iCal feed
5. **Reschedule** — use the reschedule URL from a confirmation, pick a new time, verify the tour updates + confirmation SMS sends
6. **Inbox reply** — send yourself an inbound SMS, reply from the inbox composer, verify it goes out + thread auto-advances
7. **AI features** — generate an AI draft on a thread, verify Send Now fires cleanly
8. **Settings save** — change any setting, refresh, verify persistence
9. **Manual lead** — add a lead manually from the modal, verify it shows up + welcome doesn't double-fire if you accidentally close+reopen
10. **Application link** — send to a test lead from the panel, verify SMS + email both arrive

## Environment variables (sanity check on Vercel)

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase's "anon" / "publishable" key)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER` (or `TWILIO_MESSAGING_SERVICE_SID`)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (e.g. `morgan@rentalsphilly.com`)
- `ANTHROPIC_API_KEY` — drives every AI feature; without it AI falls back silently
- `ENABLE_REAL_SENDING` (set to `true` for production, leave unset for simulated mode)
- `NEXT_PUBLIC_APP_URL` (https://rentalsphilly.vercel.app or your custom domain)

Cron-only:
- `CRON_SECRET` (matches Vercel Cron config; generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

See `rentalsphilly/.env.example` for the full annotated list including optional vars.

## Files that matter

- `app/page.jsx` — main admin CRM + intake/booking customer flow
- `app/c/[token]/page.jsx` — customer curated link page (phase 1/2/reschedule)
- `app/api/data/route.js` — central admin write endpoint (auth + dedup)
- `app/api/curated/[token]/route.js` — customer-facing POST (idempotent)
- `app/api/intake/welcome/route.js` — server-side welcome flow
- `app/api/send-sms/route.js` + `lib/sms.server.js` — Twilio wrapper
- `app/api/send-email/route.js` + `lib/email.server.js` — Resend wrapper
- `supabase/migrations/` — DB schema (apply all in order)
