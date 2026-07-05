# Locar.ma — Production go-live runbook

Everything below is **config/ops** — the code changes it pairs with are already merged.
Do these in order before onboarding paying agencies.

--- v

## 0. Apply database migrations

```bash
supabase db push
```

Confirms `0007_maintenance`, `0008_platform`, and **`0009_billing_enforcement`** are live.
`0009` makes suspended/deactivated agencies **read-only at the DB layer** (RLS) — the
real backstop behind the UI paywall.

Seed the platform super-admin (once):

```sql
insert into platform_admins (user_id)
select id from auth.users where email = 'YOUR_ADMIN_EMAIL' on conflict do nothing;
```

---

## 1. Billing enforcement (done in code)

- **DB**: `0009` — a suspended agency (`is_active = false` OR `subscription_status = 'suspended'`)
  can still **read** but every INSERT/UPDATE/DELETE on operational tables is rejected by RLS.
- **UI**: `/_app` renders a full-screen **Paywall** when suspended (owner gets a pay CTA,
  staff are told to contact the owner). `past_due` only shows a warning banner.
- **Admin**: platform admin sets status in `/admin/:id`. `recordPayment` flips status back to
  `active` (service-role bypasses RLS, so reactivation always works).

Nothing more to do here except **verify**: suspend a test agency in `/admin`, confirm the
paywall appears and creating a reservation fails.

---

## 2. Email — custom SMTP + templates (REQUIRED)

Supabase's built-in SMTP is throttled (~3–4 emails/hour) and will silently drop magic
links / invites in production.

### 2a. Custom SMTP
Supabase Dashboard → **Authentication → Emails → SMTP Settings** → enable custom SMTP.
Use a transactional provider (Resend, Postmark, SES). Set sender = a domain you control
(e.g. `no-reply@locar.ma`) and add its SPF/DKIM DNS records so mail doesn't spam-folder.

### 2b. Email templates → token_hash flow
The `/auth/confirm` route already handles the `token_hash` path server-side (no PKCE
verifier needed → works cross-device). Point the templates at it.

**Authentication → Emails → Templates:**

- **Magic Link**:
  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
  ```
- **Confirm signup**: same URL with `&type=signup`
- **Invite user**: same URL with `&type=invite`
  (this is what platform-admin `inviteAgencyUser` sends)

### 2c. URL configuration
**Authentication → URL Configuration:**
- **Site URL** = your production origin (`https://app.locar.ma`)
- **Redirect URLs** = add `https://app.locar.ma/auth/confirm` (+ `http://localhost:3000/auth/confirm` for dev)

A Site-URL / redirect mismatch is the other thing that breaks the login link.

---

## 3. Data privacy — private bucket for PII (REQUIRED, Loi 09-08 / CNDP)

Contract PDFs embed client CIN/passport, address, and name. Previously they were served
from the **public** bucket (anyone with the link, incl. links sent over WhatsApp).

Code now stores them in a **private docs bucket** and serves **short-lived signed URLs**
(`getContractPdfUrl`, 7-day expiry for WhatsApp sharing). To activate:

1. **Create a second R2 bucket** `locar-docs` with **no public access** (no r2.dev domain,
   no custom-domain route). Set `R2_DOCS_BUCKET=locar-docs`.
2. Keep the existing `R2_BUCKET` public — it now holds only non-sensitive assets
   (vehicle photos, logos).
3. **Regenerate contracts**: existing PDFs live in the old public bucket. Open each contract
   and hit "Regenerate PDF" (writes to the private bucket), or bulk-migrate the objects.
4. Apply CORS to both buckets (`r2-cors.json`) for the upload origins.
5. Add **Terms** and **Privacy** pages, and register the processing with the **CNDP** —
   you store scanned identity documents of Moroccan residents.

> If `R2_DOCS_BUCKET` is left unset it falls back to the public bucket — **do not ship like that.**

---

## 4. Still open (not blocking launch, schedule soon)

- Automated tests (RLS isolation, double-booking, status derivation) + error monitoring (Sentry).
- Rate-limiting on `inviteAgencyUser`, magic-link, bulk-import.
- Backups / PITR (Supabase paid tier; free tier has none).
- Self-serve payment (Stripe/CMI). Currently billing is manual (admin records payments) — fine to launch.
- Per-plan limits enforcement (`plan` column exists but isn't enforced).
