# Google Sheets sync (v2 — per-agency OAuth + snapshot rebuild)

Each agency connects its **own** Google account. The app creates a private
spreadsheet in that account's Drive and mirrors the agency's data into it as a
**full snapshot** — read all rows, overwrite the six tabs. One-way (DB → Sheet);
sheet edits are overwritten on the next sync. Client ID numbers / emails /
addresses are **excluded** (loi 09-08).

Mirrored tabs: **Cars, Reservations, Contracts, Clients, Payments, Services**.

## How it works
```
Owner clicks "Connect Google account"  (Settings)
   → getGoogleAuthUrl() → Google consent (drive.file + email)
   → /api/google-callback : exchange code → refresh token (encrypted, stored)
        → create spreadsheet in the owner's Drive → first snapshot sync
Triggers that refresh the sheet:
   • on connect               → first snapshot sync (automatic)
   • "Sync now" button        → syncNow()   (in-process snapshot rebuild)
   • (optional) external cron  → GET /api/sheets-sync  (all connected agencies)
```
No Supabase webhooks, no shared secret header, no per-row logic. A sync clears
every tab then writes header + rows — always consistent with the DB.

## 1. Google Cloud (once)
1. Create a project → enable **Google Sheets API** and **Google Drive API**.
2. **APIs & Services → OAuth consent screen**: External. Add scopes
   `.../auth/drive.file`, `openid`, `email` (all **non-sensitive** — no Google
   verification needed). Add your account under **Test users** (or Publish).
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<your-domain>/api/google-callback`
   - Copy the **Client ID** and **Client secret**.

## 2. Environment variables (Vercel Production + local)
```
GOOGLE_OAUTH_CLIENT_ID       = <client id>
GOOGLE_OAUTH_CLIENT_SECRET   = <client secret>
GOOGLE_OAUTH_REDIRECT_URI    = https://<your-domain>/api/google-callback
SHEETS_TOKEN_KEY             = <long random string; encrypts refresh tokens at rest>
CRON_SECRET                  = <long random string; guards the cron + signs OAuth state>
```
Already needed by the app: `VITE_SUPABASE_URL` (or `SUPABASE_URL`) and
`SUPABASE_SERVICE_ROLE_KEY`.

> On Vercel, `CRON_SECRET` is also sent automatically as the cron request's
> `Authorization: Bearer` — that's how `/api/sheets-sync` authenticates the hourly job.
> Tick **Production** for every var and **redeploy** after changes.

## 3. Database
Apply the migration: `supabase db push` (adds the OAuth columns to `agency_sheets`).

## 4. Scheduled refresh (optional)
No Vercel Cron is used (Hobby plan caps it at once/day). Sync runs on connect and
on the **Sync now** button. To keep sheets fresh hands-off on the free plan, point
a **free external scheduler** (cron-job.org, GitHub Actions, …) at the endpoint:
```
GET https://<domain>/api/sheets-sync
Header: Authorization: Bearer <CRON_SECRET>
```
On Vercel Pro you can instead add to `vercel.json`:
```json
"crons": [{ "path": "/api/sheets-sync", "schedule": "0 * * * *" }]
```

## 5. Turn it on per agency
Owner → **Settings → Google Sheets sync → Connect Google account** → consent.
Done — the sheet is created and filled. Use **Sync now** any time; the cron
keeps it fresh hourly.

## Manual sync trigger (debug)
```bash
# one agency
curl -i -X POST https://<domain>/api/sheets-sync \
  -H "x-cron-secret: <CRON_SECRET>" -H "content-type: application/json" \
  -d '{"agencyId":"<agency-uuid>"}'
# all agencies (what the cron does)
curl -i https://<domain>/api/sheets-sync -H "authorization: Bearer <CRON_SECRET>"
```

## Notes / limits
- **One-way** (DB → Sheet). Sheet edits are overwritten.
- **PII excluded**: no CIN/passport, email, or address.
- Snapshot cost: 2 Sheets API calls per agency per sync (batchClear + batchUpdate).
- The stored refresh token is **AES-256-GCM encrypted** (key = `sha256(SHEETS_TOKEN_KEY)`);
  rotating `SHEETS_TOKEN_KEY` invalidates all stored tokens (agencies re-connect).
- **Disconnect** drops the token and stops syncing; the spreadsheet stays in the
  owner's Drive.
