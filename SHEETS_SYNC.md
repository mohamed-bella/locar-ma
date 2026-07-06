# Google Sheets live sync (DB → Sheet)

One-way, near-realtime mirror of each agency's data into a private Google Sheet.
Postgres fires a **Supabase Database Webhook** on every row change →
`/api/sheet-sync` upserts the row into the agency's spreadsheet (keyed by id in
column A). Edits in the sheet never sync back. Client ID numbers/addresses are
**excluded**.

Mirrored tabs: **Cars, Reservations, Contracts, Clients, Payments, Services**.

## 1. Google Cloud (once)
1. Create a project → enable **Google Sheets API** and **Google Drive API**.
2. Create a **Service Account** → **Keys → Add key → JSON**. Download it.
3. From the JSON copy `client_email` and `private_key`.

## 2. Environment variables (Vercel + local)
```
GOOGLE_SERVICE_ACCOUNT_EMAIL = <client_email>
GOOGLE_PRIVATE_KEY           = <private_key, keep the \n escapes as-is>
SHEET_SYNC_SECRET            = <a long random string>
```
The endpoint also needs (already set for the app):
`VITE_SUPABASE_URL` (or `SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY`.

> `GOOGLE_PRIVATE_KEY` contains newlines. Paste it with literal `\n` (the code
> unescapes them), or wrap the real multi-line value in quotes.

## 3. Database
Apply the migration: `supabase db push` (creates `agency_sheets`).

## 4. Supabase Database Webhooks
Dashboard → **Database → Webhooks → Create** — one webhook per table:

| Table | Events | Type | URL | Header |
|---|---|---|---|---|
| vehicles | insert, update, delete | HTTP POST | `https://<domain>/api/sheet-sync` | `x-sheet-secret: <SHEET_SYNC_SECRET>` |
| reservations | insert, update, delete | HTTP POST | same | same |
| contracts | insert, update, delete | HTTP POST | same | same |
| clients | insert, update, delete | HTTP POST | same | same |
| agency_payments | insert, update, delete | HTTP POST | same | same |
| service_records | insert, update, delete | HTTP POST | same | same |

(Default Supabase payload `{ type, table, record, old_record }` is what the
endpoint expects.)

## 5. Turn it on per agency
Agency owner → **Settings → Google Sheets sync → Enable**. The app creates the
spreadsheet, shares it with the owner's Google account, and starts mirroring.

## Notes / limits
- **One-way** (DB → Sheet). Sheet edits are ignored and will be overwritten.
- **PII excluded**: no CIN/passport, email, or address. Contracts/clients carry
  only names/phones. (Loi 09-08.)
- Scopes: `spreadsheets` + `drive.file` (the service account only touches files
  it creates).
- Latency ~1–5 s (webhooks are async). Google write quota ≈ 60/min per sheet —
  fine for normal agencies.
- If Google/Sheets is down, the DB is unaffected; Supabase retries the webhook.
