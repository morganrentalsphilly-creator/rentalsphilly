// Email allow-list for the admin views.
//
// Anyone NOT on this list — even if they have a valid Supabase session —
// is bounced to the unauthorized screen. Add a teammate by appending their
// email here (lowercase) and redeploying.
//
// Optional override: NEXT_PUBLIC_ADMIN_EMAILS env var (comma-separated).
// If set, it REPLACES this default list. Useful for previews.

const HARDCODED_ADMINS = [
  'morganrentalsphilly@gmail.com',
];

export function getAdminEmails() {
  const env = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (env && env.trim()) {
    return env.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return HARDCODED_ADMINS.map((s) => s.toLowerCase());
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().includes(String(email).toLowerCase());
}
