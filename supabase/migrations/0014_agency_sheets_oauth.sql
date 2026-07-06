-- Locar.ma — Google Sheets sync v2: per-agency OAuth + snapshot rebuild.
--
-- The agency owner connects their OWN Google account (OAuth, drive.file scope).
-- The app creates the spreadsheet in their Drive and stores an ENCRYPTED refresh
-- token. Sync is a full snapshot rebuild (overwrite tabs), triggered by a
-- "Sync now" button and an hourly cron — no more per-row webhooks.

alter table agency_sheets
  add column if not exists google_refresh_token_enc text,   -- AES-256-GCM: ivB64.tagB64.ctB64
  add column if not exists google_email             text,   -- connected Google account (display)
  add column if not exists last_synced_at           timestamptz,
  add column if not exists last_sync_error          text;

-- spreadsheet_id was NOT NULL under the old service-account flow (row only
-- existed after a sheet was provisioned). The OAuth flow inserts the row at
-- connect time, before the sheet exists — relax it.
alter table agency_sheets alter column spreadsheet_id drop not null;

comment on column agency_sheets.google_refresh_token_enc is
  'AES-256-GCM encrypted Google OAuth refresh token (key = sha256(SHEETS_TOKEN_KEY)).';
